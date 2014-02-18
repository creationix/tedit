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
var loadSubModule = require('./projects').loadSubModule;
var carallel = require('carallel');
var pathJoin = require('pathjoin');
var binary = require('bodec');
var defer = require('js-git/lib/defer');

// Hold references to the root configs.
var configs = {};

module.exports = {

  configs: configs,

  // (callback(path, hash))
  onChange: onChange,

  // (name, storage) -> newName
  addRoot: addRoot,
  // (oldName, newName) -> newName
  renameRoot: renameRoot,
  // (name) ->
  removeRoot: removeRoot,

  // (path) => tree, hash
  readTree: readTree,
  // (path) => commit, hash
  readCommit: readCommit,
  // (path) => blob, hash
  readFile: readFile,
  // (path) => target, hash
  readLink: readLink,
  // (path) => newPath
  makeUnique: makeUnique,
  // (path) => entry, repo, config
  readEntry: readEntry,

  // (path, blob) => hash
  writeFile: writeFile,
  // (path, target) => hash
  writeLink: writeLink,
  // (path) =>
  deleteEntry: deleteEntry,
  // (oldPath, newPath) =>
  moveEntry: moveEntry,
  // (oldPath, newPath) =>
  copyEntry: copyEntry,
  // (path, mode) =>
  setMode: setMode,
  // (path, url) =>
  addSubModule: addSubModule,

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

// Add a write to the write queue
function writeEntry(path, entry, callback) {
  if (!pendingWrites) {
    // Start recording writes to be written
    pendingWrites = {};
    writeCallbacks = [];
    // defer so that other writes this tick get bundled
    defer(writeEntries);
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
    var root = configs[path] ? path : longestMatch(path, roots);
    if (!root) return onWriteDone(new Error("Can't find root for " + path));
    var group = groups[root] || (groups[root] = {});
    var local = path.substring(root.length + 1);
    group[local] = writes[path];
  });

  var leaves = findLeaves();
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
    var repo = findStorage(config).repo;
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
      // Skip submodules, they will get changed later.
      if (root.indexOf("/") >= 0) return;

      var hash = currents[root];
      // Update the config
      configs[root].current = hash;
      // And notify and listeners for root paths
      changeListeners.forEach(function (listener) {
        listener(root, hash);
      });
    });

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

function readEntry(path, callback) {
  // If there is a write in progress, wait for it to finish before reading
  if (writing) {
    if (readQueues[path]) readQueues[path].push(callback);
    else readQueues[path] = [callback];
    return;
  }
  pathToEntry(path, callback);
}

////////////////////////////////////////////////////////////////////////////////

// Allows code to listen for changes to repo root commit hashes.
function onChange(callback) {
  changeListeners.push(callback);
}

////////////////////////////////////////////////////////////////////////////////

// (name, config) => newName
function addRoot(name, config, callback) {
  expandConfig(config, function (err) {
    if (err) return callback(err);
    name = genName(name, configs);
    config.root = name;
    configs[name] = config;
    callback(null, name);
  });
}


// (oldName, newName) -> newName
function renameRoot(oldName, newName) {
  throw "TODO: Implement renameRoot";
}

// (name) ->
function removeRoot(name) {
  throw "TODO: Implement removeRoot";
}

////////////////////////////////////////////////////////////////////////////////

// The real work to convert a path to a git tree entry, repo, and config
// This data is often cached and so non-callback style is used to keep stack small.
function pathToEntry(path, callback) {
  var parts = path.split("/").filter(Boolean);
  var rootTree;
  var root = parts[0];
  var index = 1;
  var config = configs[root];
  if (!config) return callback();
  if (!config.current) return callback(new Error("Missing current in config " + path));
  var repo = findStorage(config).repo;
  if (!repo) return callback(new Error("Missing repo for " + path));

  var mode = modes.commit;
  var hash = config.current;
  path = root;

  return walk();

  function walk() {
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
        if (path === root) rootTree = cached;
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
            repo = findStorage(config).repo;
          }
          else {
            return loadSubModule(repo, config, rootTree, root, path, onSubConfig);
          }
        }
        continue;
      }
      return callback(null, null, repo, config);
    }
    callback(null, {
      mode: mode,
      hash: hash
    }, repo, config);
  }

  function onEntry(err, entry) {
    if (!entry) return callback(err || new Error("Missing entry at " + path));
    return walk();
  }

  function onSubConfig(err, subConfig) {
    if (err) return callback(err);
    root = path;
    config = configs[root] = subConfig;
    repo = findStorage(config).repo;
    return walk();
  }

}

////////////////////////////////////////////////////////////////////////////////

// (path) => tree, hash
function readTree(path, callback) {
  if (!callback) return readTree.bind(null, path);
  if (!path) return readRootTree(callback);
  return readEntry(path, onEntry);

  function onEntry(err, entry, repo) {
    if (!entry) return callback(err);
    if (entry.mode === modes.commit) {
      return repo.loadAs("commit", entry.hash, onCommit);
    }
    if (entry.mode === modes.tree) {
      return repo.loadAs("tree", entry.hash, callback);
    }
    return callback(new Error("Invalid mode"));

    function onCommit(err, commit) {
      if (!commit) return callback(err || new Error("Missing commit"));
      return repo.loadAs("tree", commit.tree, callback);
    }
  }
}

// Create a virtual tree containing all the roots as if they were submodules.
function readRootTree(callback) {
  if (!callback) return readRootTree;
  var names = Object.keys(configs).sort();
  var tree = {};
  names.forEach(function (name) {
    // Only include root repos.
    if (name.indexOf("/") >= 0) return;
    tree[name] = {
      mode: modes.commit,
      hash: configs[name].current
    };
  });
  callback(null, tree, hashAs("tree", tree));
}

// (path) => commit, hash
function readCommit(path, callback) {
  if (!callback) return readCommit.bind(null, path);
  readEntry(path, function (err, entry, repo) {
    if (!entry) return callback(err);
    if (entry.mode !== modes.commit) return callback("Not a commit " + path);
    repo.loadAs("commit", entry.hash, callback);
  });
}

// (path) => blob, hash
function readFile(path, callback) {
  if (!callback) return readFile.bind(null, path);
  readEntry(path, function (err, entry, repo) {
    if (entry === undefined) return callback(err);
    if (!modes.isFile(entry.mode)) return callback("Not a file " + path);
    repo.loadAs("blob", entry.hash, callback);
  });
}

// (path) => target, hash
function readLink(path, callback) {
  if (!callback) return readLink.bind(null, path);
  readEntry(path, onEntry);

  function onEntry(err, entry, repo) {
    if (entry === undefined) return callback(err);
    if (entry.mode !== modes.sym) return callback("Not a symlink " + path);
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

// (path) => mode, hash
function getMode(path, callback) {
  if (!callback) return getMode.bind(null, path);
  callback("TODO: getMode");
}

// Given a path, return a path in the same folder that's unique
// (path) => newPath
function makeUnique(path, callback) {
  if (!callback) return makeUnique.bind(null, path);
  var index = path.lastIndexOf("/");
  var dir = path.substring(0, index);
  var name = path.substring(index + 1);
  readTree(dir, onTree);

  function onTree(err, tree) {
    if (err) return callback(err);
    if (!tree) return callback(null, path);
    callback(null, pathJoin(dir, genName(name, tree)));
  }
}

// Given a path, return the repo that controls that segment
// (path) => repo
function getRepo(path, callback) {
  if (!callback) return getRepo.bind(null, path);
  readEntry(path, function (err, entry, repo, config) {
    if (!repo) return callback(err || new Error("Missing repo " + path));
    callback(null, repo, config);
  });
}

////////////////////////////////////////////////////////////////////////////////

// (path, blob) => hash
function writeFile(path, blob, callback) {
  if (!callback) return writeFile.bind(null, path, blob);
  var mode;

  readEntry(path, onEntry);

  function onEntry(err, entry, repo) {
    if (err) return callback(err);
    // Set mode to normal file unless file exists already and is executable
    mode = (entry && entry.mode === modes.exec) ? entry.mode : modes.file;
    repo.saveAs("blob", blob, onHash);
  }

  function onHash(err, hash) {
    if (err) return callback(err);
    writeEntry(path, { mode: mode, hash: hash }, callback);
  }
}

// (path, target) => hash
function writeLink(path, target, callback) {
  if (!callback) return writeLink.bind(null, path, target);

  getRepo(path, onRepo);

  function onRepo(err, repo) {
    if (err) return callback(err);
    repo.saveAs("blob", binary.fromUnicode(target), onHash);
  }

  function onHash(err, hash) {
    if (err) return callback(err);
    writeEntry(path, { mode: modes.sym, hash: hash }, callback);
  }
}

// (path) =>
function deleteEntry(path, callback) {
  if (!callback) return deleteEntry.bind(null, path);
  writeEntry(path, {}, callback);
}

// (oldPath, newPath) =>
function moveEntry(oldPath, newPath, callback) {
  if (!callback) return moveEntry.bind(null, oldPath, newPath);
  readEntry(oldPath, onEntry);

  function onEntry(err, entry) {
    if (!entry) return callback(err || new Error("Not found " + oldPath));
    writeEntry(oldPath, {});
    writeEntry(newPath, entry, callback);
  }
}

// (oldPath, newPath) =>
function copyEntry(oldPath, newPath, callback) {
  if (!callback) return copyEntry.bind(null, oldPath, newPath);
  readEntry(oldPath, onEntry);

  function onEntry(err, entry) {
    if (!entry) return callback(err || new Error("Not found " + oldPath));
    writeEntry(newPath, entry, callback);
  }
}

// Create or update an entry.  If it doesn't exist, create an empty file or folder
// If it exists and the old mode is compatable, update the mode
// (path, mode) =>
function setMode(path, mode, callback) {
  if (!callback) return setMode.bind(null, path, mode);
  var type = modes.toType(mode);
  readEntry(path, onEntry);

  function onEntry(err, entry, repo) {
    if (err) return callback(err);
    if (!entry) {
      var body;
      if (type === "blob") body = "";
      else if (type === "tree") body = {};
      else return callback(new Error("Can't create empty " + type));
      return repo.saveAs(type, body, onHash);
    }
    if (modes.toType(entry.mode) !== type) {
      return callback(new Error("Incompatable modes"));
    }
    onHash(null, entry.hash);
  }

  function onHash(err, hash) {
    if (err) return callback(err);
    writeEntry(path, { mode: mode, hash: hash }, callback);
  }
}

// (path, url) =>
function addSubModule(path, url, callback) {
  if (!callback) return addSubModule.bind(null, path, url);
  callback("TODO: addSubModule");
}

////////////////////////////////////////////////////////////////////////////////

// Generates a good unique root name from an almost arbitrary string.
function genName(string, obj) {
  var base = string.substring(string.lastIndexOf("/") + 1).replace(/\.git$/, "").replace(/[!@#%\^&*()\\|+=[\]~`,<>?:;"']+/gi, " ").trim() || "unnamed";
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
