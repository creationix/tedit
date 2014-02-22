/*global -name*/
/*
 * This is a mutable filesystem abstraction on top a tree of repositories.
 * This has a global read/write lock.  Reads are allowed to happen without
 * restriction as long as there are no writes happening.  When a write gets
 * requested, a write batch is created.  It will wait till end of event tick to
 * see if there are any more changes to write.  Once the write has started,
 * further reads and writes are queued.  When the write finishes, it first
 * releases the queued reads and lets them run in the background. If there were
 * queued writes as well, the process will start over with the new write batch.
 *
 * The workspace is represented as one git repository with nested submodules.
 *
 */

// Load dependencies
{
  var binary   = require('bodec');
  var carallel = require('carallel');
  var defer    = require('js-git/lib/defer');
  var modes    = require('js-git/lib/modes');
  var codec    = require('js-git/lib/config-codec');
  var cache    = require('js-git/mixins/mem-cache').cache;

  var rescape  = require('./rescape');
  var prefs = require('ui/prefs');
}

// Export public interface
module.exports = {

  // Initialize the system with a repo config.  This is
  // the root repo that can't be seen or edited.  All projects are
  // simply submodules of this master workspace.
  // onChange is called whenever the root hash changes.
  init: init,               // (config, current, onChange) =>
  // Set the root commit hash.  This triggers an onChange call
  setRoot: setRoot,         // (hash)

  // Slow Write Actions
  // These will perform some I/O and then later perform their own batch write.
  // Create a new git repo from config {url, ...}.  This will first create the
  // repo instance and clone/mount it to find the head commit has.  It will
  // then write the submodule entry
  addRepo: addRepo,         // (path, config) => hash
  setHead: setHead,         // (path, hash) => hash
  setCurrent: setCurrent,   // (path, hash) => hash

  // Read Functions (path) => entry, [repo, config, root]
  // These function will queue if there is an active write.
  // They are not exclusive to each other however.
  // readEntry will output nothing if the target doesn't exist, but the others
  // will error out if the target is not there and the desired type.
  readEntry: readEntry,     // (path) => { mode, hash }
  readCommit: readCommit,   // (path) => { mode, hash, commit }
  readTree: readTree,       // (path) => { mode, hash, tree }
  readBlob: readBlob,       // (path) => { mode, hash, blob }
  readLink: readLink,       // (path) => { mode, hash, link }

  // Safe Writes
  // These are safe write because they only write immutable hashes.
  // They still need read access to know which repo to save to or read from.
  saveAs: saveAs,           // (path, type, value) => hash
  // Prepare an entry to be moved or copied.  If both paths are the same repo
  // then this is a no-op that calls the callback immediately.  If they are
  // different repos, then all containing hashes are copied over.
  prepEntry: prepEntry,     // (path, target) => entry

  // Write Actions
  // These actions are auto-batched and create a global lock when they start.
  // The write starts at the end of the tick when these start.
  // These will error out if the data they need to read is not cached already.
  // Thus they gurantee to put their write action in the queue this tick.
  // Their callback is called when the write actions are flushed and complete.
  writeEntry: writeEntry,   // (path, entry) =>
  copyEntry: copyEntry,     // (path, target) =>
  moveEntry: moveEntry,     // (path, target) =>
  deleteEntry: deleteEntry, // (path) =>

  isDirty: isDirty,
  isGithub: isGithub,


};

// Create local state
{
  // Data for repos is keyed by path. The root config is keyed by "".
  // Live js-git instances by path
  var repos = {};
  // Config data by path
  var configs = prefs.get("configs", {});
  // Pre-parsed .gitmodules data by path { hash, meta }
  // meta is in the form { submodule: { $path: { path, url, ref, ... } } }
  var gitmodules = {};
  // Store the hash to the current root node
  var rootHash = prefs.get("rootHash");
  // Remember the onChange hook
  var change;
}

// Define public functions
////////////////////////////////////////////////////////////////////////////////

function init(onChange, callback) {
  var config = configs[""] || {};

  // Store the change handler
  change = onChange;

  livenConfig(config, rootHash, function (err, repo, current) {
    if (err) return callback(err);
    repos[""] = repo;
    configs[""] = config;
    rootHash = current;
    prefs.set("rootHash", rootHash);
    callback(null, rootHash);
  });
}

function setRoot(hash) {
  if (!hash) throw new Error("Missing root hash");
  rootHash = hash;
  prefs.set("rootHash", rootHash);
  defer(function () { change(rootHash); });
}

function addRepo(path, config, callback) {
  if (!callback) return addRepo.bind(null, path, config);
  livenConfig(config, null, function (err, repo, hash) {
    if (err) return callback(err);
    var newConfig = {};
    for (var key in config) {
      if (key === "github" || key === "head" || key === "current") continue;
      newConfig[key] = config[key];
    }
    addGitmodule(path, newConfig);
    repos[path] = repo;
    configs[path] = config;
    writeEntry(path, {
      mode: modes.commit,
      hash: hash
    }, callback);
  });
}

function setHead(path, hash, callback) {
  if (!callback) return setHead.bind(null, path, hash);
  // Load the old commit for path
  readEntry(path, function (err, entry) {
    if (err) return callback(err);

    // Set head on the config
    entry.config.head = hash;
    prefs.save();

    // If the entry is not the right hash, update it.
    if (entry.hash === hash) return onWrite();
    writeEntry(path, {
      mode: modes.commit,
      hash: hash
    }, onWrite);

    function onWrite(err) {
      if (err) return callback(err);
      // Once we know the tree has the right entry, update the ref bookmark
      entry.repo.updateRef(entry.config.ref, hash, callback);
    }
  });
}

function setCurrent(path, hash, callback) {
  if (!callback) return setCurrent.bind(null, path, hash);
  readEntry(path, function (err, entry) {
    if (err) return callback(err);
    hash = hash || entry.config.head;
    if (!hash) {
      return callback(new Error("Nothing to revert to"));
    }
    // Wipe all config state when manually reverting.  It will re-initialize.
    writeEntry(path, {
      mode: modes.commit,
      hash: hash
    }, callback);
    trimConfig(path);
  });
}

function readEntry(path, callback) {
  if (!callback) return readEntry.bind(null, path);
  // If there are any pending writes, wait for them to flush before reading.
  if (pendingWrites) {
    if (readQueues[path]) readQueues[path].push(callback);
    else readQueues[path] = [callback];
    return;
  }
  pathToEntry(path, callback);
}

function readCommit(path, callback) {
  if (!callback) return readCommit.bind(null, path);
  readEntry(path, function (err, entry) {
    if (err) return callback(err);
    if (!entry.hash) return callback(err || new Error("Missing commit: " + JSON.stringify(path)));
    if (entry.mode !== modes.commit) return callback(new Error("Not a commit:" + JSON.stringify(path)));
    // Make sure config.current matches the hash in the tree
    entry.config.current = entry.hash;

    entry.repo.loadAs("commit", entry.hash, onCurrent);

    function onCurrent(err, commit) {
      if (!commit) return callback(err || new Error("Problem loading current commit"));
      entry.commit = commit;
      if (!entry.config.head) return callback(null, entry);
      entry.repo.loadAs("commit", entry.config.head, onHead);
    }

    function onHead(err, commit) {
      if (!commit) return callback(err || new Error("Problem loading head commit"));
      entry.head = commit;
      callback(null, entry);
    }
  });
}

function readTree(path, callback) {
  if (!callback) return readTree.bind(null, path);
  readEntry(path, function (err, entry) {
    if (err) return callback(err);
    if (!entry.hash) return callback(err || new Error("Missing entry"));
    if (entry.mode === modes.commit) {
      return entry.repo.loadAs("commit", entry.hash, onCommit);
    }
    if (entry.mode === modes.tree) {
      return entry.repo.loadAs("tree", entry.hash, onTree);
    }
    return callback(new Error("Invalid mode 0" + entry.mode.toString(8)));

    function onCommit(err, commit) {
      if (!commit) return callback(err || new Error("Missing commit"));
      return entry.repo.loadAs("tree", commit.tree, onTree);
    }

    function onTree(err, tree, hash) {
      if (!tree) return callback(err || new Error("Missing tree " + hash));
      entry.mode = modes.tree;
      entry.hash = hash;
      entry.tree = tree;
      callback(null, entry);
    }
  });
}

function readBlob(path, callback) {
  if (!callback) return readBlob.bind(null, path);
  readEntry(path, function (err, entry) {
    if (err) return callback(err);
    if (!entry.hash) return callback(err || new Error("Missing entry"));
    if (!modes.isFile(entry.mode)) return callback("Not a file");
    entry.repo.loadAs("blob", entry.hash, function (err, blob) {
      if (!blob) return callback(err || new Error("Problem loading blob"));
      entry.blob = blob;
      callback(null, entry);
    });
  });
}

function readLink(path, callback) {
  if (!callback) return readLink.bind(null, path);
  readEntry(path, function (err, entry) {
    if (err) return callback(err);
    if (!entry.hash) return callback(err || new Error("Missing entry"));
    if (entry.mode !== modes.sym) return callback("Not a symlink");
    entry.repo.loadAs("blob", entry.hash, function (err, blob) {
      if (err) return callback(err);
      try { entry.link = binary.toUnicode(blob); }
      catch (err) { return callback(err); }
      callback(null, entry);
    });
  });
}

function saveAs(path, type, value, callback) {
  if (!callback) return saveAs.bind(null, path, type, value);
  // Look up the right repo to save the value into.
  readEntry(path, function (err, entry) {
    if (err) return callback(err);
    entry.repo.saveAs(type, value, callback);
  });
}

function prepEntry(path, target, callback) {
  if (!callback) return prepEntry.bind(null, path, target);
  readEntry(target, function (err, targetEntry) {
    if (err) return callback(err);
    readEntry(path, function (err, entry) {
      if (err) return callback(err);
      // If the repos match or the entry is not a tree, we're done.
      if (entry.mode !== modes.tree || targetEntry.repo === entry.repo) {
        return callback(null, entry);
      }
      targetEntry.repo.hasHash("tree", entry.hash, function (err, has) {
        if (err) return callback(err);
        // If the destination already has the tree hash, we're done.
        if (has) return callback(null, entry);
        deepCopy(entry.repo, targetEntry.repo, entry, function (err) {
          if (err) return callback(err);
          callback(null, entry);
        });
      });
    });
  });
}

// Used to copy a tree of hashes from one repo to another.  Used in cross-repo
// copies
function deepCopy(source, dest, entry, callback) {
  if (!callback) return deepCopy.bind(null, source, dest, entry);
  if (entry.mode === modes.commit) return callback();
  var type = modes.toType(entry.mode);
  source.loadAs(type, entry.hash, function (err, value) {
    if (!value) return callback(err || new Error("Missing " + type + " " + entry.hash));
    dest.saveAs(type, value, function (err) {
      if (err) return callback(err);
      if (type !== "tree") return callback();
      carallel(Object.keys(value).map(function (name) {
        return deepCopy(source, dest, value[name]);
      }), callback);
    }, entry.hash);
  });
}


function writeEntry(path, entry, callback) {
  if (!callback) return writeEntry.bind(null, path, entry);
  if (!pendingWrites) {
    // Start recording writes to be written
    pendingWrites = {};
    writeCallbacks = [];
    // Defer starting the write to collect more writes this tick.
    defer(writeEntries);
  }
  if (!path) {
    if (!entry.hash) {
      return callback(new Error("Root cannot be deleted"));
    }
    if (entry.mode !== modes.commit) {
      return callback(new Error("Only commits can be written to root"));
    }
  }
  pendingWrites[path] = entry;
  if (callback) writeCallbacks.push(callback);
}

function copyEntry(path, target, callback) {
  if (!callback) return copyEntry.bind(null, path, target);
  // Copy path related data between trees
  var entry = pathToEntry(path);
  if (!entry.hash) return callback(new Error("Can't find source"));
  copyConfig(path, target);
  writeEntry(target, {
    mode: entry.mode,
    hash: entry.hash
  }, callback);
  prefs.save();
}

function moveEntry(path, target, callback) {
  if (!callback) return moveEntry.bind(null, path, target);
  var entry = pathToEntry(path);
  if (!entry.hash) return callback(new Error("Can't find source"));

  copyConfig(path, target);
  carallel([
    writeEntry(path, {}),
    writeEntry(target, {
      mode: entry.mode,
      hash: entry.hash
    })
  ], callback);
  deleteConfig(path);
  prefs.save();
}

function deleteEntry(path, callback) {
  if (!callback) return deleteEntry.bind(null, path);
  deleteConfig(path);
  writeEntry(path, {}, callback);
  prefs.save();
}

function isDirty(path) {
  var config = configs[path];
  if (!config) return;
  return config.current !== config.head;
}

function isGithub(path) {
  var config = configs[path] || configs[findParentPath(path)];
  if (!config) throw new Error("Can't find config for");
  return config.github && getGithubName(config.url);
}


// Define internal helper functions
////////////////////////////////////////////////////////////////////////////////


function findRepo(path) {
  var repo = repos[path];
  if (repo) return repo;
  var config = configs[path];
  if (!config) throw new Error("No repo at " + JSON.srtingify(path));
  repo = repos[path] = createRepo(config);
  return repo;
}

function getGithubName(url) {
  var match = url.match(/github.com[:\/](.*?)(?:\.git)?$/);
  if (!match) throw new Error("Url is not github repo: " + url);
  return match[1];
}

// Create a repo instance from a config
function createRepo(config) {
  var repo = {};
  if (config.github) {
    if (!config.url) throw new Error("Missing url in github config");
    var githubName = getGithubName(config.url);
    var githubToken = prefs.get("githubToken", "");
    if (!githubToken) throw new Error("Missing github access token");
    require('js-git/mixins/github-db')(repo, githubName, githubToken);
    // Github has this built-in, but it's currently very buggy
    require('js-git/mixins/create-tree')(repo);
    // Cache github objects locally in indexeddb
    require('js-git/mixins/add-cache')(repo, require('js-git/mixins/indexed-db'));
  }
  else {
    // Prefix so we can find our refs after a reload
    if (!config.prefix) {
      config.prefix = Date.now().toString(36) + "-" + (Math.random() * 0x100000000).toString(36);
      prefs.save();
    }
    require('js-git/mixins/indexed-db')(repo, config.prefix);
    require('js-git/mixins/create-tree')(repo);
  }

  // require('js-git/mixins/delay')(repo, 200);

  // Cache everything except blobs over 100 bytes in memory.
  require('js-git/mixins/mem-cache')(repo);

  // // Combine concurrent read requests for the same hash
  require('js-git/mixins/read-combiner')(repo);

  return repo;
}

// Given a bare config with { [url], [ref], [github], [head] },
// create a live repo and look up the head commit hash.
// => repo, current
function livenConfig(config, current, callback) {
  var repo;
  try {
    repo = createRepo(config);
    var ref = config.ref || (config.ref = "refs/heads/master");
    if (config.head) onHead();
    else repo.readRef(ref, onHead);
  }
  catch (err) { return callback(err); }

  function onHead(err, hash) {
    if (err) return callback(err);
    if (hash) config.head = hash;
    if (!current) {
      if (config.head) current = config.head;
      else if (config.url && !config.github) {
        return callback(new Error("TODO: Implement clone"));
      }
      else return initEmpty(repo, null, onCurrent);
    }
    config.current = current;
    callback(null, repo, current);
  }

  function onCurrent(err, hash) {
    if (!hash) return callback(err || new Error("Invalid current hash"));
    current = hash;
    onHead();
  }

  return repo;
}

// When creating new empty repos, we still need an empty tree and a temporary commit.
function initEmpty(repo, tree, callback) {
  if (tree) return onTree(null, tree);
  return repo.saveAs("tree", [], onTree);

  function onTree(err, hash) {
    if (err) return callback(err);
    return repo.saveAs("commit", {
      tree: hash,
      author: {
        name: "AutoInit",
        email: "tedit@creationix.com"
      },
      message: "Initial Empty Commit"
    }, callback);
  }
}

// Given a path, find the parent state {repo, config}
function findParentPath(path, roots) {
  var longest = "";
  roots = roots || Object.keys(configs);
  roots.forEach(function (root) {
    if (!isunder(path, root)) return;
    if (root.length > longest.length) {
      longest = root;
    }
  });
  return longest;
}

// Pending readEntry requests during a write
// key is path, value is array of callbacks
var readQueues = {};

// This stores to-be-saved changes
var pendingWrites = null;
// registered callbacks that want to know when the bulk write is done
var writeCallbacks = null;
// Flag to know if an actual write is in progress
var writing = false;

// Pending .gitmodules changes
var pendingChanges = {};

function writeEntries() {
  // Exclusive write lock
  if (writing) return;
  writing = true;

  // Import write data into this closure
  // Other writes that happen while we're busy will get queued
  var writes = pendingWrites;
  pendingWrites = null;
  var callbacks = writeCallbacks;
  writeCallbacks = null;


  // If there are any changed .gitmodules we need to write those out as well.
  var changeNames = Object.keys(pendingChanges);
  if (changeNames.length) {
    changeNames.forEach(function (root) {
      var meta = pendingChanges[root].meta;
      var path = join(root, ".gitmodules");

      var encoded = codec.encode(meta);
      if (!encoded.trim()) {
        // Delete the file if it's now empty
        writes[path] = {};
      }
      else {
        writes[path] = {
          mode: modes.file,
          content: encoded
        };
      }
    });
    pendingChanges = {};
  }

  // Lock reads to wait till thie write is finished
  readQueues = {};

  // Store output hashes by path
  var currents = {};

  // Break up the writes into the separate repos they belong in.
  var groups = {};
  var roots = Object.keys(configs);
  var paths = Object.keys(writes);
  for (var i = 0, l = paths.length; i < l; i++) {
    var path = paths[i];
    var entry = writes[path];
    if (!path) {
      currents[""] = entry.hash;
      return onWriteDone();
    }
    var root = findParentPath(path, roots);
    var group = groups[root] || (groups[root] = {});
    var local = localbase(path, root);
    group[local] = entry;
  }


  var leaves = findLeaves();

  if (!leaves.length) return onWriteDone();
  carallel(leaves.map(processLeaf), onProcessed);

  // Find repo groups that have no dependencies and process them in parallel
  function findLeaves() {
    var paths = Object.keys(groups);
    var parents = {};
    paths.forEach(function (path) {
      // we use an if to filter out the root path.  It doesn't have a parent.
      if (path) parents[findParentPath(path, paths)] = true;
    });

    return paths.filter(function (path) {
      return !parents[path];
    });
  }

  // Delegate most of the work out to repo.createTree
  // When it comes back, create a temporary commit.
  function processLeaf(root) {
    var config = configs[root];
    var repo = findRepo(root);
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
    for (var i = 0, l = leaves.length; i < l; i++) {
      var path = leaves[i];
      var hash = hashes[i];
      currents[path] = hash;
      if (!path) return onWriteDone();
      var parent = findParentPath(path, roots);
      var parentGroup = groups[parent] || (groups[parent] = {});
      var localPath = localbase(path, parent);
      parentGroup[localPath] = {
        mode: modes.commit,
        hash: hash
      };
    }
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

    // Update the configs
    Object.keys(currents).forEach(function (root) {
      var hash = currents[root];
      configs[root].current = hash;
    });
    prefs.save();

    // Tell the callbacks we're done.
    callbacks.forEach(function (callback) {
      callback(err);
    });

    // Update the tree root to point to the new version
    setRoot(currents[""]);

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

// The real work to convert a path to a git tree entry, repo, and config
// This data is often cached and so non-callback style is used to keep stack small.
// If called without a callback, this is in sync mode and returns the value
// If a node is not cached, sync mode will throw.  Async mode will wait for it
// to load.
function pathToEntry(path, callback) {

  // Initialize state with the root entry
  var entry = {
    mode: modes.commit,
    hash: rootHash,
    repo: repos[""],
    config: configs[""],
    root: ""
  };

  // Empty path is just the root node.
  if (!path) {
    if (callback) return callback(null, entry);
    return entry;
  }

  // Get ready to walk the path
  var parts = path.split("/").filter(Boolean);
  var index = 0;
  var partial = "";

  return walk();

  // This function has an interesting structure.  It's optimized to not grow
  // the stack in the case of cached values.  When it encounters a value not
  // in the cache, it aborts the loop and picks up where it left off after
  // the value is loaded.
  function walk() {
    var cached;
    while (index < parts.length) {
      // When traversing through a commit node, load the associated tree first.
      if (entry.mode === modes.commit) {
        // Try to load the commit object from cache
        cached = cache[entry.hash];
        if (!cached) {
          // If it's not there wait or throw depending on mode.
          if (callback) return entry.repo.loadAs("commit", entry.hash, onEntry);
          throw new Error("Commit not cached");
        }
        // Move the entry to the tree object and fall-through to tree case
        entry.mode = modes.tree;
        entry.hash = cached.tree;
      }
      // Load the contents of a tree to find the next segment.
      if (entry.mode === modes.tree) {
        cached = cache[entry.hash];
        // Try to load the tree from cache.  Same as before.
        if (!cached) {
          if (callback) return entry.repo.loadAs("tree", entry.hash, onEntry);
          throw new Error("Tree not cached");
        }
        // Whenever we load the tree object for the root of a repo, we load and
        // cache the .gitmodules file too.
        if (partial === entry.root) {
          // Check if the gitmodules cache is up to date
          if (!loadGitmodules(entry.root, cached)) return;
        }

        // Move the path up one segment
        var part = parts[index++];
        partial = join(partial, part);
        cached = cached[part];
        entry.mode = cached && cached.mode;
        entry.hash = cached && cached.hash;

        // If the path doesn't exist, send an empty entry
        if (!cached) {
          if (callback) return callback(null, entry);
          return entry;
        }

        // Non-commit entries can just continue with the next loop
        if (entry.mode !== modes.commit) continue;
        // If the new node is a commit, we need to switch repos to the submodule
        // If it's already configured, load and continue the loop.
        if (configs[partial]) {
          entry.root = partial;
          entry.config = configs[partial];
          entry.repo = findRepo(partial);
          continue;
        }
        // If we don't have the config already, then wait or throw depending.
        if (callback) return loadSubModule();
        throw new Error("Submodule not cached: " + partial);
      }
      // We reached a non-walkable path, so the target doesn't exist.
      entry.mode = undefined;
      entry.hash = undefined;
      if (callback) return callback(null, entry);
      return entry;
    }
    if (callback) return callback(null, entry);
    return entry;
  }

  // This is a generic callback that resumes flow at the top of flow after
  // loading a cachable value (trees and commits).
  function onEntry(err, entry) {
    if (!entry) return callback(err || new Error("Missing entry"));
    return walk();
  }

  // Returns true if the value is already in memory
  // Otherwise it returns false and calls the callback when ready
  // This need to be called whenever reading the root tree in a repo.
  function loadGitmodules(root, tree) {
    var entry = tree[".gitmodules"];
    // If there is no file to load, we're done
    if (!entry) return true;
    var modules = gitmodules[root] || (gitmodules[root] = {meta:{}});
    // If there is a file, but our cache is up-to-date, we're done
    if (entry.hash === modules.hash) return true;
    var repo = findRepo(root);
    if (!callback) throw new Error(".gitmodules not cached");
    repo.loadAs("blob", entry.hash, function (err, blob) {
      if (!blob) return callback(err || new Error("Missing blob " + entry.hash));
      if (entry.hash === modules.hash) return walk();
      try {
        var text = binary.toUnicode(blob);
        var meta = codec.decode(text);
        modules.meta = meta;
        modules.hash = entry.hash;
      }
      catch (err) { return callback(err); }
      walk();
    });
  }

  function loadSubModule() {
    var config = getGitmodule(partial);
    if (!config) return callback(new Error("Missing .gitmodules entry"));
    if (entry.config.github) config.github = true;
    return livenConfig(config, entry.hash, function (err, repo, current) {
      if (err) return callback(err);
      if (entry.hash !== current) {
        return callback(new Error("current mismatch"));
      }
      entry.root = partial;
      entry.config = configs[partial] = config;
      entry.repo = repos[partial] = repo;
      prefs.save();
      walk();
    });
  }

}

// Lookup the .gitmodules entry for submodule at path
// (path) -> {path, url}
function getGitmodule(path) {
  var root = findParentPath(path);
  var localPath = localbase(path, root);
  var modules = gitmodules[root];
  if (!modules) return;
  var meta = modules.meta;
  if (!meta) return;
  var submodules = meta.submodule;
  if (!submodules) return;
  return cloneObject(submodules[localPath]);
}


// Add a .gitmodules entry for submodule at path with url
function addGitmodule(path, config) {
  var root = findParentPath(path);
  var localPath = localbase(path, root);
  var modules = gitmodules[root] || (gitmodules[root] = {});
  var meta = modules.meta || (modules.meta = {});
  var submodules = meta.submodule || (meta.submodule = {});
  config.path = localPath;
  submodules[localPath] = config;
  pendingChanges[root] = modules;
}

// Quick deep-clone of an object.
function cloneObject(obj) {
  var newObj = {};
  Object.keys(obj).forEach(function (key) {
    var value = obj[key];
    if (value && typeof value === "object") {
      if (Array.isArray(value)) value = value.slice();
      else value = cloneObject(value);
    }
    newObj[key] = value;
  });
  return newObj;
}

function copyConfig(from, to) {

  // Copy any configs at or under `from` to `to`.
  var regexp = new RegExp("^" + rescape(from) + "(?=/|$)");
  Object.keys(configs).forEach(function (path) {
    if (!regexp.test(path)) return;
    var newPath = path.replace(regexp, to);
    configs[newPath] = cloneObject(configs[path]);
  });

  // Copy any submodule configs at or under `from` to `to`.
  // But to find the config, we need to look up to the roots of `from` and `to`.
  var root = findParentPath(from);
  var modules = gitmodules[root];
  var meta = modules && modules.meta;
  var submodules = meta && meta.submodule;
  if (submodules) {
    var localPath = submodules && localbase(from, root);
    var subregexp = new RegExp("^" + rescape(localPath) + "(?=/|$)");
    Object.keys(submodules).forEach(function (path) {
      var config = submodules[path];
      if (!subregexp.test(path)) return;
      var oldPath = join(root, path);
      var newPath = oldPath.replace(regexp, to);
      addGitmodule(newPath, cloneObject(config));
    });
  }
}

function deleteConfig(from) {
  var regexp = new RegExp("^" + rescape(from) + "(?=/|$)");
  Object.keys(configs).forEach(function (path) {
    if (!regexp.test(path)) return;
    delete configs[path];
    delete gitmodules[path];
    if (repos[path]) delete repos[path];
  });

  // Look for entries in the parent .gitmodules to remove
  var root = findParentPath(from);
  var modules = gitmodules[root];
  var meta = modules && modules.meta;
  var submodules = meta && meta.submodule;
  if (submodules) {
    var localPath = submodules && localbase(from, root);
    var subregexp = new RegExp("^" + rescape(localPath) + "(?=/|$)");
    Object.keys(submodules).forEach(function (name) {
      var config = submodules[name];
      if (!subregexp.test(config.path)) return;
      delete submodules[name];
      pendingChanges[root] = modules;
    });
  }

}

function trimConfig(from) {
  var regexp = from ? new RegExp("^" + rescape(from) + "(?=/)") :
                      new RegExp("^.");
  Object.keys(configs).forEach(function (path) {
    if (!regexp.test(path)) return;
    delete configs[path];
    if (repos[path]) delete repos[path];
  });
}

function join(base, path) {
  return base ? base + "/" + path : path;
}

// Calculates the parent directory of a path.
//  Path "foo/bar" becomes "foo".
//  Path "foo" becomes "".
//  Path "" throw an error.
function dirname(path) {
  if (!path) throw new Error("No parent for root");
  var index = path.lastIndexOf("/");
  return index < 0 ? "" : path.substring(0, index);
}

// Calculates a local path relative to some root.
//  Path "foo/bar" with root "" is "foo/bar".
//  Path "foo/bar" with root "foo" is "bar".
function localbase(path, root) {
  return root ? path.substring(root.length + 1) : path;
}

// Decides true if path is a subpath of root
//  Root "" with any path except "" is true.
//  Root "foo" with path "foo" is false.
//  Root "foo" with path "foobar" is false.
//  Root "foo" with path "foo/bar" is true.
function isunder(path, root) {
  if (!root) return !!path;
  return path.substring(0, root.length + 1) === root + "/";
}
