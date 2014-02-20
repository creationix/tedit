/*
This is a mutable filesystem abstraction on top of the repos tree.
This has a global read/write lock.  Reads are allowed to happen without restriction
as long as there are no writes happening.  When a write gets requested, a write batch
is created.  It will wait till end of event tick to see if there are any more changes
to write.  Once the write has started, further reads and writes are queued.  When the
write finishes, it first releases the queued reads and lets them run in the background.
If there were queued writes as well, the process will start over with the new write batch.

Path is a global path including root-project name as the first path segment.
Commit nodes can be read as either tree or commit depending on which data
you're interested in.

*Entry operations don't work on root nodes.  They only work on nodes that have parent trees.

*/

var findStorage = require('./storage');
var hashAs = require('js-git/lib/encoders').hashAs;
var modes = require('js-git/lib/modes');
var cache = require('js-git/mixins/mem-cache').cache;
var expandConfig = require('./projects').expandConfig;
var createRepo = require('./projects').createRepo;
var configFromUrl = require('./projects').configFromUrl;
var parseConfig = require('js-git/lib/config-codec').parse;
var encodeConfig = require('js-git/lib/config-codec').encode;
var carallel = require('carallel');
var binary = require('bodec');
var defer = require('js-git/lib/defer');
var prefs = require('ui/prefs');

// Hold references to the root configs.
var configs = prefs.get("treeConfig", {});

module.exports = {

  // Garbage collection hooks
  removeRoots: removeRoots,
  renameRoots: renameRoots,
  copyRoots: copyRoots,
  trimRoots: trimRoots,
  flushChanges: flushChanges,

  // onChange(callback(path, hash))
  //  Register a listener to be notified when the commit hash for a commit node
  //  changes.  This gets called for root nodes and submodules.
  onChange: onChange,

  // addRoot(name, config) -> newName
  //  Add a new root to the filesystem.  Config can be a minimal config missing
  //  important things like `current`.  To mount a github repo, only pass in
  //  { githubName: "some/name" }.  To create an empty repo, pass in {}. To
  //  clone a remote repo pass in { url: "git://url/here.git" }
  //  Returned is the actual name after ensuring it's unique.
  addRoot: addRoot,

  // renameRoot(oldName, newName) -> newName
  //  Rename a root by name to a new name.  The newName will be made unique and
  //  returned.
  renameRoot: renameRoot,

  // removeRoot(name) ->
  //  Remove a root from the local fs tree.
  removeRoot: removeRoot,


  // readCommit(path) => commit, hashes
  //  Given a path, load the commit and 4 hashes {current,currentTree,head,headTree}
  //  The commit value is the one that current points to
  readCommit: readCommit,

  // readTree(path) => tree, hash, repo, config
  //  Given a path, load the git tree with it's hash
  readTree: readTree,

  // readFile(path) => blob, hash
  //  Read a filepath as a blob
  readFile: readFile,

  // readLink(path) => target, hash
  //  Read a link target as text
  readLink: readLink,

  readEntry: readEntry,

  // isDirty(path) -> isDirty
  //  Tells you if there are unsaved changes at this path.
  //  Currently it only works for commit nodes.
  isDirty: isDirty,

  // isGithub(path) -> isGithub
  //  Tells you if the path is inside a mounted github repo
  //  This is false for cloned repos, even if they come from github
  isGithub: isGithub,

  // (path, blob) => hash
  writeFile: writeFile,
  // (path, target) => hash
  writeLink: writeLink,

  // writeCommit(path, commit) => hash
  //  write a commit to the branch at path. Also updates the commit entry in the
  //  parent repo and updates the ref in the child repo.
  writeCommit: writeCommit,

  // writeSubmodule(path, url) => hash
  //  lookup the master hash for repo at url (cloning if needed).
  //  create a commit entry in the tree and insert an entry in the paren't .gitmodules file
  //  caller is responsible to call flushChanges during write.
  writeSubmodule: writeSubmodule,

  // revertToHead(path)
  //  Move a tree back to the head commit.
  revertToHead: revertToHead,

  // (path, entry) =>
  writeEntry: writeEntry,

  customImport: customImport,

  // saveAs(path, type, value) => hash
  //  Save a value in the git database.  Path is only used to lookup the repo
  //  The entry at that path is not modified.  This does not require a write
  //  lock and can be done in parallel with any reads.
  saveAs: saveAs,
};

////////////////////////////////////////////////////////////////////////////////

var changeListeners = [];

// Pending readEntry requests during a write
// key is path, value is array of callbacks
var readQueues = {};

// This stores to-be-saved changes
var pendingWrites = null;
// registered callbacks that want to know when the bulk write is done
var writeCallbacks = null;
// Flag to know if an actual write is in progress
var writing = false;

function readEntry(path, callback) {
  // If there is a write in progress, wait for it to finish before reading
  if (writing) {
    if (readQueues[path]) readQueues[path].push(callback);
    else readQueues[path] = [callback];
    return;
  }
  pathToEntry(path, callback);
}

// Add a write to the write queue
function writeEntry(path, entry, callback) {
  if (!callback) return writeEntry.bind(null, path, entry);
  if (!pendingWrites) {
    // Start recording writes to be written
    pendingWrites = {};
    writeCallbacks = [];
    // defer so that other writes this tick get bundled
    if (!writing) defer(writeEntries);
  }
  pendingWrites[path] = entry;
  if (callback) writeCallbacks.push(callback);
}

function writeEntries() {
  // Import write data into this closure
  // Other writes that happen while we're busy will get
  var writes = pendingWrites;
  pendingWrites = null;
  var callbacks = writeCallbacks;
  writeCallbacks = null;
  // Lock reads to wait till thie write is finished
  readQueues = {};
  // New hashes to be written upon completion of transaction.
  var currents = {};
  writing = true;

  // Break up the writes into the separate repos they belong in.
  var groups = {};
  var roots = Object.keys(configs);
  Object.keys(writes).forEach(function (path) {
    var root = longestMatch(path, roots);
    var entry = writes[path];
    if (!root) {
      if (path.indexOf("/") < 0 && entry.mode === modes.commit) {
        currents[path] = entry.hash;
        return;
      }
      return onWriteDone(new Error("Can't find root"));
    }
    var group = groups[root] || (groups[root] = {});
    var local = root ? path.substring(root.length + 1) : path;
    group[local] = entry;
  });

  var leaves = findLeaves();
  if (!leaves.length) return onWriteDone();
  carallel(leaves.map(processLeaf), onProcessed);

  // Find reop groups that have no dependencies and process them in parallel
  function findLeaves() {
    var paths = Object.keys(groups);
    var parents = {};
    paths.forEach(function (path) {
      var parent = longestMatch(path, paths);
      parents[parent] = true;
    });
    return paths.filter(function (path) {
      return !parents[path];
    });
  }

  // Delegate most of the work out to repo.createTree
  // When it comes back, create a temporary commit.
  function processLeaf(root) {
    var config = configs[root];
    var repo = findRepo(config);
    var group = groups[root];
    delete groups[root];
    var actions = Object.keys(group).map(function (path) {
      var entry = group[path];
      entry.path = path;
      return entry;
    });
    actions.base = cache[config.current].tree;
    return function (callback) {
      var treeHash;
      repo.createTree(actions, onTree);

      function onTree(err, hash) {
        if (err) return callback(err);
        treeHash = hash;
        if (config.head) {
          return repo.loadAs("commit", config.head, onHead);
        }
        onHead();
      }

      function onHead(err, head) {
        if (err) return callback(err);
        // If the tree matches the one in HEAD, revert to head.
        if (head && head.tree === treeHash) return callback(null, config.head);
        // If not create a temporary commit.
        var commit = {
          tree: treeHash,
          author: {
            name: "AutoCommit",
            email: "tedit@creationix.com"
          },
          message: "Uncommitted changes in tedit"
        };
        if (config.head) commit.parent = config.head;
        repo.saveAs("commit", commit, callback);
      }
    };
  }

  function onProcessed(err, hashes) {
    if (err) return onWriteDone(err);
    leaves.forEach(function (path, i) {
      var hash = hashes[i];
      currents[path] = hash;
      var parent = longestMatch(path, roots);
      if (parent) {
        var parentGroup = groups[parent] || (groups[parent] = {});
        parentGroup[path.substring(parent.length + 1)] = {
          mode: modes.commit,
          hash: hash
        };
      }
    });
    leaves = findLeaves();
    if (!leaves.length) return onWriteDone();
    carallel(leaves.map(processLeaf), onProcessed);
  }

  function onWriteDone(err) {
    if (err) {
      return callbacks.forEach(function (callback) {
        callback(err);
      });
    }

    // Process changed roots
    Object.keys(currents).forEach(function (root) {

      var hash = currents[root];
      // Update the config
      configs[root].current = hash;
      // And notify and listeners for root paths
      changeListeners.forEach(function (listener) {
        listener(root, hash);
      });
    });

    prefs.save();

    // Tell the callbacks we're done.
    callbacks.forEach(function (callback) {
      callback(err);
    });

    writing = false;

    // Flush and pending reads that were waiting on us to finish writing
    flushReads();

    // If there are writes that were waiting on us, start them now.
    if (pendingWrites) writeEntries();
  }

}

function flushReads() {
  var queues = readQueues;
  readQueues = {};
  Object.keys(queues).forEach(function (path) {
    var callbacks = queues[path];
    readEntry(path, function () {
      for (var i = 0, l = callbacks.length; i < l; i++) {
        callbacks[i].apply(null, arguments);
      }
    });
  });
}

////////////////////////////////////////////////////////////////////////////////

// Allows code to listen for changes to repo root commit hashes.
function onChange(callback) {
  changeListeners.push(callback);
}

////////////////////////////////////////////////////////////////////////////////

// (name, config) -> newName
function addRoot(name, config, callback) {
  name = genName(name, configs);
  configs[name] = config;
  prefs.save();
  if (callback) callback(null, name);
  return name;
}

// (oldName, newName) -> newName
function renameRoot(oldName, newName, callback) {
  var config = configs[oldName];
  if (!config) throw new Error("No such root " + oldName);
  removeRoot(oldName);
  return addRoot(newName, config, callback);
}

// (name) ->
function removeRoot(name, callback) {
  if (!(name in configs)) throw new Error("No such root " + name);
  delete configs[name];
  prefs.save();
  if (callback) callback();
}

////////////////////////////////////////////////////////////////////////////////

// The real work to convert a path to a git tree entry, repo, and config
// This data is often cached and so non-callback style is used to keep stack small.
function pathToEntry(path, callback) {
  var parts = path.split("/").filter(Boolean);
  var gitmodules;
  var root = parts[0];
  var index = 1;
  var config = configs[root];
  if (!config) return callback();
  if (!config.current) return expandConfig(config, onExpanded);
  var repo = findRepo(config);
  if (!repo) return callback(new Error("Missing repo"));

  var mode = modes.commit;
  var hash = config.current;
  path = root;

  return walk();

  function onExpanded(err) {
    if (err) return callback(err);
    if (!config.current) return callback(new Error("Unable to find current"));
    prefs.save();
    return pathToEntry(path, callback);
  }

  // This function has an interesting structure.  It's optimized to not grow
  // the stack in the case of cached values.  When it encounters a value not
  // in the cache, it aborts the loop and picks up where it left off after
  // the value is loaded.
  function walk(err) {
    if (err) return callback(err);
    var cached;
    while (index < parts.length) {
      if (mode === modes.commit) {
        cached = cache[hash];
        if (!cached) return repo.loadAs("commit", hash, onEntry);
        mode = modes.tree;
        hash = cached.tree;
      }
      if (mode === modes.tree) {
        cached = cache[hash];
        if (!cached) return repo.loadAs("tree", hash, onEntry);
        if (path === root) {
          // If it needs to load the file, we can wait.
          if (!loadGitmodules(root, cached, walk)) return;
        }
        var part = parts[index++];
        var entry = cached[part];
        if (!entry) return callback(null, null, repo, config);
        path += "/" + part;
        mode = entry.mode;
        hash = entry.hash;
        if (mode === modes.commit) {
          if (configs[path]) {
            root = path;
            config = configs[root];
            repo = findRepo(config);
          }
          else {
            var gitmodule = getGitmodule(path);
            if (!gitmodule) return callback(new Error("Missing .gitmodules entry"));
            return expandConfig(configFromUrl(gitmodule.url, config), onSubConfig);
          }
        }
        continue;
      }
      return callback(null, null, repo, config);
    }
    callback(null, {
      mode: mode,
      hash: hash
    }, repo, config, root);
  }

  // This is a generic callback that resumes flow at the top of flow after
  // loading a cachable value (trees and commits).
  function onEntry(err, entry) {
    if (!entry) return callback(err || new Error("Missing entry"));
    return walk();
  }

  function onSubConfig(err, subConfig) {
    if (err) return callback(err);
    root = path;
    config = configs[root] = subConfig;
    prefs.save();
    repo = findRepo(config);
    return walk();
  }

}

////////////////////////////////////////////////////////////////////////////////

// (path) => tree, hash, repo, config
function readTree(path, callback) {
  if (!callback) return readTree.bind(null, path);
  if (!path) return readRootTree(callback);
  return readEntry(path, onEntry);

  function onEntry(err, entry, repo, config) {
    if (!entry) return callback(err);
    if (entry.mode === modes.commit) {
      return repo.loadAs("commit", entry.hash, onCommit);
    }
    if (entry.mode === modes.tree) {
      return repo.loadAs("tree", entry.hash, callback);
    }
    return callback(new Error("Invalid mode 0" + entry.mode.toString(8)));

    function onCommit(err, commit) {
      if (!commit) return callback(err || new Error("Missing commit"));
      return repo.loadAs("tree", commit.tree, onTree);
    }

    function onTree(err, tree, hash) {
      callback(err, tree, hash, repo, config);
    }
  }
}

// Create a virtual tree containing all the roots as if they were submodules.
function readRootTree(callback) {
  var names = Object.keys(configs).sort();
  var tree = {};
  names.forEach(function (name) {
    // Only include root repos.
    if (name.indexOf("/") >= 0) return;
    tree[name] = {
      mode: modes.commit,
      hash: configs[name].current || ""
    };
  });
  callback(null, tree, hashAs("tree", tree));
}

// (path) => commit, hashes
function readCommit(path, callback) {
  if (!callback) return readCommit.bind(null, path);
  var commit, hashes, repo, config;
  readEntry(path, onEntry);

  function onEntry(err, entry, _repo, _config) {
    repo = _repo;
    config = _config;
    if (!entry) return callback(err);
    if (entry.mode !== modes.commit) return callback("Not a commit");
    // Sanity check.  These should always equal.
    config.current = entry.hash;
    hashes = { current: config.current };
    repo.loadAs("commit", entry.hash, onCurrent);
  }

  function onCurrent(err, result) {
    if (!result) return callback(err || new Error("Problem loading current commit"));
    commit = result;
    hashes.currentTree = commit.tree;
    if (!config.head) return callback(null, commit, hashes);
    repo.loadAs("commit", config.head, onHead);
  }

  function onHead(err, result) {
    if (!result) return callback(err || new Error("Problem loading head commit"));
    hashes.head = config.head;
    hashes.headTree = result.tree;
    callback(null, commit, hashes);
  }
}

// (path) => blob, hash
function readFile(path, callback) {
  if (!callback) return readFile.bind(null, path);
  readEntry(path, function (err, entry, repo) {
    if (entry === undefined) return callback(err);
    if (!modes.isFile(entry.mode)) return callback("Not a file");
    repo.loadAs("blob", entry.hash, callback);
  });
}

// (path) => target, hash
function readLink(path, callback) {
  if (!callback) return readLink.bind(null, path);
  readEntry(path, onEntry);

  function onEntry(err, entry, repo) {
    if (entry === undefined) return callback(err);
    if (entry.mode !== modes.sym) return callback("Not a symlink");
    repo.loadAs("blob", entry.hash, onBlob);
  }

  function onBlob(err, blob, hash) {
    if (err) return callback(err);
    var text;
    try { text = binary.toUnicode(blob); }
    catch (err) { return callback(err); }
    callback(null, text, hash);
  }
}

function isDirty(path) {
  var config = configs[path];
  if (!config) return;
  return config.current !== config.head;
}

function isGithub(path) {
  var config = configs[path] || configs[longestMatch(path, configs)];
  if (!config) throw new Error("Can't find config for");
  return config.githubName;
}

// Given a path, return the repo that controls that segment
// (path) => repo, config, root
function getRepo(path, callback) {
  if (!callback) return getRepo.bind(null, path);
  var config = configs[path];
  if (config) {
    var repo = findRepo(config);
    return callback(null, repo, config, path);
  }
  var dir = path.substring(0, path.lastIndexOf("/"));
  readEntry(dir, function (err, entry, repo, config, root) {
    if (!repo) return callback(err || new Error("Missing repo"));
    callback(null, repo, config, root);
  });
}

////////////////////////////////////////////////////////////////////////////////

// Common logic between writeFile, writeLink, and writeCommit
// This helps writes make it into write batches by pre-calculating the hash for
// the entry.
function writeAs(type, path, mode, repo, body, callback) {
  var hash = hashAs(type, body);
  carallel({
    hash: function (callback) {
      repo.saveAs(type, body, callback);
    },
    write: writeEntry(path, { mode: mode, hash: hash })
  }, function (err, results) {
    if (err) return callback(err);
    if (results.hash !== hash) return callback(new Error("hash mismatch"));
    callback(null, hash);
  });
  // Also return hash sync for writeCommit
  return hash;
}

// (path, blob) => hash
function writeFile(path, blob, callback) {
  if (!callback) return writeFile.bind(null, path, blob);
  readEntry(path, function (err, entry, repo) {
    if (err) return callback(err);
    // Set mode to normal file unless file exists already and is executable
    var mode = (entry && entry.mode === modes.exec) ? entry.mode : modes.file;
    writeAs("blob", path, mode, repo, blob, callback);
  });
}

// (path, target) => hash
function writeLink(path, target, callback) {
  if (!callback) return writeLink.bind(null, path, target);
  getRepo(path, function (err, repo) {
    if (err) return callback(err);
    var blob = binary.fromUnicode(target);
    writeAs("blob", path, modes.sym, repo, blob, callback);
  });
}

function writeCommit(path, commit, callback) {
  if (!callback) return writeCommit.bind(null, path, commit);
  var config = configs[path];
  if (!config) return callback(new Error("Not a commit node"));
  var repo = findRepo(config);
  var hash = writeAs("commit", path, modes.commit, repo, commit, onWrite);
  config.current = config.head = hash;

  function onWrite(err) {
    if (err) return callback(err);
    repo.updateRef("refs/heads/master", config.head, callback);
  }
}

// (path, url) => hash
// has side effect of storing .gitmodules change in pendingChanges
function writeSubmodule(path, url, callback) {
  getRepo(path, function (err, repo, config) {
    if (err) return callback(err);
    expandConfig(configFromUrl(url, config), function (err, childConfig) {
      if (err) return callback(err);
      configs[path] = childConfig;
      addGitmodule(path, url);
      carallel([
        writeEntry(path, {
          mode: modes.commit,
          hash: childConfig.current
        }),
        flushChanges(path)
      ], function (err) {
        if (err) return callback(err);
        callback(null, childConfig.hash);
      });
    });
  });
}

function revertToHead(path, callback) {
  if (!callback) return revertToHead.bind(null, path);
  var config = configs[path];
  if (!config) return callback(new Error("Missing config"));
  if (!config.head) return callback(new Error("No head to revert to"));
  config.current = config.head;
  writeEntry(path, { mode: modes.commit, hash: config.head}, callback);
}

function saveAs(path, type, value, callback) {
  if (!callback) return saveAs.bind(null, path, type, value);
  getRepo(path, function (err, repo) {
    if (err) return callback(err);
    repo.saveAs(type, value, callback);
  });
}

////////////////////////////////////////////////////////////////////////////////

// Generates a good unique root name from an almost arbitrary string.
function genName(string, obj) {
  var base = string.substring(string.lastIndexOf("/") + 1).replace(/\.git$/, "").replace(/[@#%\^&\\|=[\]~`,<>?:;"\/]+/gi, " ").trim() || "unnamed";
  var name = base;
  var i = 1;
  while (name in obj) {
    name = base + "-" + (++i);
  }
  return name;
}

// Given an array of paths and a path, find the longest substring.
// This is good for finding the nearest ancestor for tree paths.
function longestMatch(path, roots) {
  var longest = "";
  for (var i = 0, l = roots.length; i < l; i++) {
    var root = roots[i];
    if (root.length < longest.length) continue;
    if (path.substring(0, root.length + 1) === root + "/") {
      longest = root;
    }
  }
  return longest;
}

function findRepo(config) {
  var storage = findStorage(config);
  return storage.repo || (storage.repo = createRepo(config));
}

function removeRoots(regexp, callback) {
  var dirty = false;
  var names = Object.keys(configs);
  names.forEach(function (name) {
    if (regexp.test(name)) {
      removeGitmodule(name);
      delete configs[name];
      dirty = true;
    }
  });
  if (dirty) prefs.save();
  if (callback) callback();
}

function renameRoots(regexp, path, callback) {
  var dirty = false;
  Object.keys(configs).forEach(function (name) {
    if (regexp.test(name)) {
      var newName = name.replace(regexp, path);
      configs[newName] = configs[name];
      var gitmodule = getGitmodule(name);
      if (gitmodule) {
        removeGitmodule(name);
        addGitmodule(newName, gitmodule.url);
      }
      delete configs[name];
      dirty = true;
    }
  });
  if (dirty) prefs.save();
  if (callback) callback();
}

function copyRoots(regexp, path, callback) {
  var dirty = false;
  Object.keys(configs).forEach(function (name) {
    if (regexp.test(name)) {
      var newName = name.replace(regexp, path);
      configs[newName] = JSON.parse(JSON.stringify(configs[name]));
      var gitmodule = getGitmodule(name);
      if (gitmodule) {
        addGitmodule(newName, gitmodule.url);
      }
      dirty = true;
    }
  });
  if (dirty) prefs.save();
  if (callback) callback();
}

function trimRoots(regexp, tree, callback) {
  var paths = Object.keys(configs);
  for (var i = 0, l = paths.length; i < l; i++) {
    var path = paths[i];
    var match = path.match(regexp);
    if (match && !tree[match[1]]) {
      delete configs[path];
    }
  }
  if (callback) callback();
}

function customImport(path, importer, callback) {
  getRepo(path, onRepo);

  function onRepo(err, repo) {
    if (err) return callback(err);
    importer(repo, callback);
  }
}

////////////////////////////////////////////////////////////////////////////////

var pendingChanges = {};

// Add a .gitmodules entry for submodule at path with url
function addGitmodule(path, url) {
  var root = longestMatch(path, Object.keys(configs));
  var localPath = path.substring(root.length + 1);
  var storage = findStorage(configs[root]);
  var gitmodules = storage.gitmodules || (storage.gitmodules = {});
  var meta = gitmodules.meta || (gitmodules.meta = {});
  var submodules = meta.submodule || (meta.submodule = {});
  submodules[localPath] = {
    path: localPath,
    url: url
  };
  pendingChanges[root] = gitmodules;
  return true;
}

// Remove .gitmodules entry for submodule at path
// Returns true if changes were made that need changing.
function removeGitmodule(path) {
  var root = longestMatch(path, Object.keys(configs));
  var localPath = path.substring(root.length + 1);
  var storage = findStorage(configs[root]);
  var gitmodules = storage.gitmodules;
  if (!gitmodules) return false;
  var meta = gitmodules.meta;
  if (!meta) return false;
  var submodules = meta.submodule;
  if (!submodules) return false;
  var dirty = false;
  Object.keys(submodules).forEach(function (name) {
    var entry = submodules[name];
    if (entry.path === localPath) {
      delete submodules[name];
      dirty = true;
    }
  });
  if (dirty) {
    pendingChanges[root] = gitmodules;
  }
  return dirty;
}

// Lookup the .gitmodules entry for submodule at path
// (path) -> {path, url}
function getGitmodule(path) {
  var root = longestMatch(path, Object.keys(configs));
  var localPath = path.substring(root.length + 1);
  var storage = findStorage(configs[root]);
  var gitmodules = storage.gitmodules;
  if (!gitmodules) return;
  var meta = gitmodules.meta;
  if (!meta) return;
  var submodules = meta.submodule;
  if (!submodules) return;
  var name, submodule;
  var names = Object.keys(submodules);
  for (var i = 0, l = names.length; i < l; i++) {
    name = names[i];
    submodule = submodules[name];
    if (submodule.path === localPath) return submodule;
  }
}

// Returns true if the value is already in memory
// Otherwise it returns false and calls the callback when ready
// This need to be called whenever reading the root tree in a repo.
function loadGitmodules(root, tree, callback) {
  var entry = tree[".gitmodules"];
  // If there is no file to load, we're done
  if (!entry) return true;
  var storage = findStorage(configs[root]);
  var gitmodules = storage.gitmodules || (storage.gitmodules = {});
  // If there is a file, but our cache is up-to-date, we're done
  if (entry.hash === gitmodules.hash) return true;
  var config = configs[root];
  var repo = findRepo(config);
  repo.loadAs("blob", entry.hash, function (err, blob) {
    if (!blob) return callback(err || new Error("Missing blob " + entry.hash));
    try {
      var text = binary.toUnicode(blob);
      var meta = parseConfig(text);
      gitmodules.meta = meta;
      gitmodules.hash = entry.hash;
    }
    catch (err) { return callback(err); }
    callback();
  });
}

function flushChanges(path, callback) {
  if (!callback) return flushChanges.bind(null, path);
  var changes = pendingChanges;
  var paths = Object.keys(changes);
  if (!paths.length) return callback();
  pendingChanges = {};
  carallel(paths.map(function (root) {
    var gitmodules = changes[root];
    return function (callback) {
      var blob;
      try {
        var text = encodeConfig(gitmodules.meta);
        blob = text.trim() && binary.fromUnicode(text);
      }
      catch (err) { callback(err); }
      var gitmodulesPath = root + "/.gitmodules";
      if (blob) writeFile(gitmodulesPath, blob, callback);
      else writeEntry(gitmodulesPath, {}, callback);
    };
  }), callback);
}
