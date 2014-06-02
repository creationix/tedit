define("git-tree.js", ["bodec.js","carallel.js","jon-parse.js","pathjoin.js","js-git/lib/defer.js","js-git/lib/modes.js","js-git/lib/config-codec.js","js-git/mixins/mem-cache.js"], function (module, exports) { /*global -name*/
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
var binary   = require('bodec.js');
var carallel = require('carallel.js');
var jonParse = require('jon-parse.js');
var pathJoin = require('pathjoin.js');
var defer    = require('js-git/lib/defer.js');
var modes    = require('js-git/lib/modes.js');
var codec    = require('js-git/lib/config-codec.js');
var cache    = require('js-git/mixins/mem-cache.js').cache;

// Platform must implement the following interface:
//   platform.configs
//   platform.repos
//   platform.getRootHash() -> rootHash
//   platform.setRootHash(rootHash) ->
//   platform.saveConfig() ->
//   platform.createRepo(config) -> repo
module.exports = function (platform) {
  var configs = platform.configs;
  var repos = platform.repos;

  // Pre-parsed .gitmodules data by path { hash, meta }
  // meta is in the form { submodule: { $path: { path, url, ref, ... } } }
  var gitmodules = {};
  // Remember the onChange hook
  var change;

  // Setup resolvePath(path, raw, callback(err, {mode,hash,root,...}))
  var resolvePath = gitTree({
    has: function (hash) { return cache[hash] !== undefined; },
    get: function (hash) { return cache[hash]; },
    getRootHash: platform.getRootHash,
    loadAs: function (root, type, hash, callback) {
      if (!(/^[0-9a-f]{40}$/.test(hash))) throw new TypeError("Invalid hash '" + hash + "'");
      var repo = repos[root];
      if (!repo) return callback(new Error("No repo for root '" + root + "'"));
      repo.loadAs(type, hash, function (err, value) {
        if (value === undefined) {
          return callback(err || new Error("Missing " + type + " " + hash + " in " + root));
        }
        return callback(null, value, hash);
      });
    },
    hasRepo: function (root) { return !!repos[root]; },
    initializeRepo: function (root, hash, path, callback) {
      loadSubModule({
        mode: modes.commit,
        hash: hash,
        root: root
      }, path, callback);
    },
    hasGitmodules: function (root, hash) {
      if (!hash) {
        delete gitmodules[root];
        return true;
      }
      return gitmodules[root] && gitmodules[root].hash === hash;
    },
    storeGitmodules: function (root, hash, callback) {
      // Look up or create cache data for this .gitmodules file
      var modules = gitmodules[root] || (gitmodules[root] = {meta:{}});
      var repo = repos[root];
      repo.loadAs("blob", hash, function (err, blob) {
        if (blob === undefined) return callback(err || new Error("Missing blob " + hash));
        if (hash === modules.hash) return callback();
        try {
          var text = binary.toUnicode(blob);
          var meta = codec.decode(text);
          modules.meta = meta;
          modules.hash = hash;
        }
        catch (err) { return callback(err); }
        callback();
      });
    },
  });

  // Pending read functions
  var readQueue = [];

  // This stores to-be-saved changes
  var pendingWrites = null;
  // registered callbacks that want to know when the bulk write is done
  var writeCallbacks = null;
  // Flag to know if an actual write is in progress
  var writing = false;

  // Pending .gitmodules changes
  var pendingChanges = {};

  // Export public interface
  return {

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
    readEntry: readEntry,     // (path) => { mode, hash, root }
    readRepo: readRepo,       // (path) => repo
    // readPath is like readEntry, except it runs the build system.
    readPath: readPath,       // (path, bake) => { mode, hash, root, [mime], fetch }
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


  // Define public functions
  ////////////////////////////////////////////////////////////////////////////////

  function init(onChange, callback) {
    var config = configs[""] || {};

    // Store the change handler
    change = onChange;
    var rootHash = platform.getRootHash();

    livenConfig(config, rootHash, function (err, repo, current) {
      if (err) return callback(err);
      repos[""] = repo;
      configs[""] = config;
      rootHash = current;
      platform.setRootHash(rootHash);
      callback(null, rootHash);
    });
  }

  function setRoot(hash) {
    if (!hash) throw new Error("Missing root hash");
    platform.setRootHash(hash);
    defer(function () { change(hash); });
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
      var config = configs[entry.root];
      config.head = hash;
      platform.saveConfig();

      // If the entry is not the right hash, update it.
      if (entry.hash === hash) return onWrite();
      writeEntry(path, {
        mode: modes.commit,
        hash: hash
      }, onWrite);

      function onWrite(err) {
        if (err) return callback(err);
        // Once we know the tree has the right entry, update the ref bookmark
        var repo = repos[entry.root];
        repo.updateRef(config.ref, hash, callback);
      }
    });
  }

  function setCurrent(path, hash, callback) {
    if (!callback) return setCurrent.bind(null, path, hash);
    readEntry(path, function (err, entry) {
      if (err) return callback(err);
      if (!hash) {
        var config = configs[entry.root];
        hash = config.head;
      }
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
      return readQueue.push(readEntry.bind(null, path, callback));
    }
    resolvePath(path, null, callback);
  }

  function readPath(path, bake, callback) {
    if (!callback) return readEntry.bind(null, path);
    // If there are any pending writes, wait for them to flush before reading.
    if (pendingWrites) {
      readQueue.push(readPath.bind(null, path, bake, callback));
    }
    resolvePath(path, bake, callback);
  }

  function readRepo(path, callback) {
    if (!callback) return readRepo.bind(null, path);
    readEntry(path, function (err, entry) {
      if (err) return callback(err);
      callback(null, repos[entry.root]);
    });
  }

  function readCommit(path, callback) {
    if (!callback) return readCommit.bind(null, path);
    readEntry(path, function (err, entry) {
      if (err) return callback(err);
      if (!entry.hash) return callback(err || new Error("Missing commit: " + JSON.stringify(path)));
      if (entry.mode !== modes.commit) return callback(new Error("Not a commit:" + JSON.stringify(path)));
      var config = configs[entry.root];
      var repo = repos[entry.root];
      // Make sure config.current matches the hash in the tree
      config.current = entry.hash;

      repo.loadAs("commit", entry.hash, onCurrent);

      function onCurrent(err, commit) {
        if (!commit) return callback(err || new Error("Problem loading current commit"));
        entry.commit = commit;
        if (!config.head) return callback(null, entry);
        repo.loadAs("commit", config.head, onHead);
      }

      function onHead(err, commit) {
        if (!commit) return callback(err || new Error("Problem loading head commit"));
        entry.head = commit;
        entry.headHash = config.head;
        callback(null, entry);
      }
    });
  }

  function readTree(path, callback) {
    if (!callback) return readTree.bind(null, path);
    readEntry(path, onEntry);

    function onEntry(err, entry) {
      if (err) return callback(err);
      if (!entry.hash) return callback(err || new Error("Missing entry"));
      if (entry.mode === modes.commit) {
        return commitToTree(path, entry, onEntry);
      }
      if (entry.mode === modes.tree) {
        var repo = repos[entry.root];
        return repo.loadAs("tree", entry.hash, onTree);
      }
      return callback(new Error("Invalid mode 0" + entry.mode.toString(8)));

      function onTree(err, tree, hash) {
        if (!tree) return callback(err || new Error("Missing tree " + hash));
        entry.mode = modes.tree;
        entry.hash = hash;
        entry.tree = tree;
        callback(null, entry);
      }
    }
  }

  function readBlob(path, callback) {
    if (!callback) return readBlob.bind(null, path);
    readEntry(path, function (err, entry) {
      if (err) return callback(err);
      if (!entry.hash) return callback(err || new Error("Missing entry"));
      if (!modes.isFile(entry.mode)) return callback("Not a file");
      var repo = repos[entry.root];
      repo.loadAs("blob", entry.hash, function (err, blob) {
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
      var repo = repos[entry.root];
      repo.loadAs("blob", entry.hash, function (err, blob) {
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
      var repo = repos[entry.root];
      repo.saveAs(type, value, callback);
    });
  }

  function prepEntry(path, target, callback) {
    if (!callback) return prepEntry.bind(null, path, target);
    readEntry(target, function (err, targetEntry) {
      if (err) return callback(err);
      readEntry(path, function (err, entry) {
        if (err) return callback(err);
        // If the repos match or the entry is not a tree, we're done.
        if (entry.mode !== modes.tree || targetEntry.root === entry.root) {
          return callback(null, entry);
        }
        var targetRepo = repos[targetEntry.root];
        var repo = repos[entry.root];
        targetRepo.hasHash("tree", entry.hash, function (err, has) {
          if (err) return callback(err);
          // If the destination already has the tree hash, we're done.
          if (has) return callback(null, entry);
          deepCopy(repo, targetRepo, entry, function (err) {
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
    var entry = resolvePath(path);
    if (!entry.hash) return callback(new Error("Can't find source"));
    copyConfig(path, target);
    writeEntry(target, {
      mode: entry.mode,
      hash: entry.hash
    }, callback);
    platform.saveConfig();
  }

  function moveEntry(path, target, callback) {
    if (!callback) return moveEntry.bind(null, path, target);
    var entry = resolvePath(path);
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
    platform.saveConfig();
  }

  function deleteEntry(path, callback) {
    if (!callback) return deleteEntry.bind(null, path);
    deleteConfig(path);
    writeEntry(path, {}, callback);
    platform.saveConfig();
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

  function getGithubName(url) {
    var match = url.match(/github.com[:\/](.*?)(?:\.git)?$/);
    if (!match) throw new Error("Url is not github repo: " + url);
    return match[1];
  }

  // Define internal helper functions
  ////////////////////////////////////////////////////////////////////////////////

  // Given a path and commit entry, find the tree entry inside it.
  function commitToTree(path, entry, callback) {
    var repo = repos[entry.root];
    repo.loadAs("commit", entry.hash, function (err, commit) {
      if (!commit) return callback(err || new Error("Missing commit"));
      var repo = repos[path];
      if (!repo) return loadSubModule(entry, path, onSub);
      onSub(null, { repo: repo, config: configs[path] });

      function onSub(err, data) {
        if (err) return callback(err);
        callback(null, {
          mode: modes.tree,
          hash: commit.tree,
          repo: data.repo,
          config: data.config,
          root: path
        });
      }
    });
  }

  function findRepo(path) {
    var repo = repos[path];
    if (repo) return repo;
    var config = configs[path];
    if (!config) throw new Error("No repo at " + JSON.srtingify(path));
    repo = repos[path] = platform.createRepo(config);
    return repo;
  }

  // Given a bare config with { [url], [ref], [github], [head] },
  // create a live repo and look up the head commit hash.
  // => repo, current
  function livenConfig(config, current, callback) {
    var repo;
    try {
      repo = platform.createRepo(config);
      var ref = config.ref || (config.ref = "refs/heads/master");
    }
    catch (err) { return callback(err); }
    if (repo.initChain) return carallel(repo.initChain, onInit);
    else return onInit();

    function onInit(err) {
      if (err) return callback(err);
      if (repo.initChain) repo.initChain = null;
      if (config.head) onHead();
      else repo.readRef(ref, onHead);
    }

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
      platform.saveConfig();

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
    var queue = readQueue;
    readQueue = [];
    queue.forEach(function (fn) { fn(); });
  }


  // Entry is entry of commit node in outer repo
  // path is global path to submodule inside
  function loadSubModule(entry, path, callback) {
    var config = configs[path];
    var extra = getGitmodule(path);
    if (!config) {
      if (!extra) return callback(new Error("Missing .gitmodules entry"));
      config = extra;
    }
    else {
      Object.keys(extra).forEach(function (key) {
        config[key] = extra[key];
      });
    }
    if (configs[entry.root].github) config.github = true;
    return livenConfig(config, entry.hash, function (err, repo, current) {
      if (err) return callback(err);
      if (entry.hash !== current) {
        return callback(new Error("current mismatch"));
      }
      var data = {
        root: path,
        config: configs[path] = config,
        repo: repos[path] = repo
      };
      platform.saveConfig();
      callback(null, data);
    });
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
};

function join(base, path) {
  return base ? base + "/" + path : path;
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

// Escape a string for inclusion in a regular expression.
function rescape(string) {
  return string.replace(/([.?*+^$[\]\\(){}|])/g, "\\$1")  ;
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


function gitTree(storage) {
  // storage provides the following interface
  //
  // storage.has(hash) -> boolean
  // storage.get(hash) -> value
  // storage.getRootHash() -> hash
  // storage.loadAs(root, type, hash) => value, hash
  // storage.hasGitmodules(root, hash) -> boolean
  // storage.storeGitmodules(root, hash) =>
  // storage.hasRepo(root) -> boolean
  // storage.initializeRepo(root, hash, path) =>

  return resolvePath;
  // In raw mode, resolve paths to {mode,hash,root} entries
  // In baked mode resolve to {mode,hash,root,[mime],fetch} where fetch accepts
  // a callback that results in (string|binary|tree|virtualTree)
  // If no callback is provided, return entry or throw if data is missing.
  // bake is a function (passed in for bake mode): bake(req) => bakedRes
  function resolvePath(path, bake, callback) {
    var mode = modes.commit;
    var hash = storage.getRootHash();
    var root = "";

    var parts = path.split("/").filter(Boolean);
    path = parts.join("/");
    var index = 0;
    var partial = "";

    // In baked mode, we need to remember tree rules.
    var rules = bake ? [] : null;

    // Start the walk loop.
    return walk();

    function walk() {
      while (index < parts.length) {
        // When a commit node is found (submodule), enter it's tree.
        if (mode === modes.commit) {
          // Make sure we have the commit already cached.
          if (!check("commit", hash)) return;
          // transition into the tree
          mode = modes.tree;
          hash = storage.get(hash).tree;
        }

        // When a tree is found, check it's contents for the next path segment.
        if (mode === modes.tree) {

          // Make sure the tree is cached before doing anything else.
          if (!check("tree", hash)) return;

          var tree = storage.get(hash);

          if (root === partial) {
            // If the tree is at a root, also make sure it's .gitmodules data is
            // already cached.
            var modulesEntry = tree[".gitmodules"];
            var modulesHash = modulesEntry && modulesEntry.hash;
            if (!storage.hasGitmodules(root, modulesHash)) {
              if (callback) {
                return storage.storeGitmodules(root, modulesHash, onLoad);
              }
              throw new Error("Unable to update .gitmodules cache '" + root + "'");
            }
          }

          var part = parts[index];
          var entry = tree[part];
          var newPath = partial ? partial + "/" + part : part;

          // If the child is a commit, make sure it's initialized
          if (entry && entry.mode === modes.commit) {
            if (!storage.hasRepo(newPath)) {
              if (callback) {
                return storage.initializeRepo(root, entry.hash, newPath, onLoad);
              }
              throw new Error("Missing repo at '" + newPath + "'");
            }
          }

          // When in baked mode, always be looking for executable rule entries.
          var ruleEntry = tree[part + ".rule"];
          if (bake && ruleEntry && ruleEntry.mode === modes.exec) {
            // Remember them for future reference.
            rules.push({
              path: newPath,
              root: root,
              hash: ruleEntry.hash
            });
          }

          if (!entry) {
            // If you get here, the entry didn't match
            // In raw-mode this is a no-find.
            if (!bake) break;
            // In bake mode, look for rule that may serve this path.
            return searchRules();
          }

          if (bake && (entry.mode === modes.sym)) {
             if (!check("blob", entry.hash)) return;
             var blob = storage.get(entry.hash);
             var link = binary.toUnicode(blob);
             var rest = parts.slice(index + 1).join("/");
             var linkPath = pathJoin(partial, link, rest);
             return resolvePath(linkPath, bake, callback);
          }

          // We're good, move on!
          mode = entry.mode;
          hash = entry.hash;
          partial = newPath;
          if (mode === modes.commit) root = partial;
          index++;
        } else {
          break;
        }
      }

      return done(index >= parts.length);
    }

    function loadRule(path, rule, callback) {
      if (!callback) return loadRule.bind(null, path, rule);
      return storage.loadAs(rule.root, "blob", rule.hash, function (err, blob) {
        if (err) return callback(err);
        if (blob === undefined) return callback(new Error("Missing blob " + rule.hash));
        var data;
        try {
          var jon = binary.toUnicode(blob);
          data = jonParse(jon);
        }
        catch (err) {
          err.message += "\nin " + rule.path + ".rule";
          err.path = rule.path + ".rule";
          return callback(err);
        }
        data.paths = {
          full: path,
          local: rule.path ? path.substring(rule.path.length + 1) : path,
          rule: rule.path,
          root: root
        };
        bake(data, callback);
      });
    }

    // The target entry was not found, this searches to see if any rules
    // generate the path.
    function searchRules() {
      return next();

      function next() {
        var rule = rules.pop();
        if (!rule) return done(false);
        loadRule(path, rule, onHandled);
      }

      function onHandled(err, result) {
        if (err) return callback(err);
        if (!(result && result.hash)) return next();
        return callback(null, result);
      }
    }

    function check(type, hash) {
      // Make sure we have the value already cached.
      if (storage.has(hash)) return true;
      if (callback && root !== undefined) {
        storage.loadAs(root, type, hash, onLoad);
        return false;
      }
      throw new Error("Missing " + type + " at '" + partial + "'");
    }

    // Generic callback to check for loading errors and resume the loop.
    function onLoad(err) {
      if (err) return callback(err);
      return walk();
    }

    function done(found) {
      var entry = { root: root };
      // In raw mode, simply send the result back
      if (!bake) {
        if (found) {
          entry.hash = hash;
          entry.mode = mode;
        }
        if (callback) return callback(null, entry);
        return entry;
      }

      // In bake mode
      if (!found) return callback();

      // Resolve commits to be trees
      if (mode === modes.commit) {
        if (!check("commit", hash)) return;
        mode = modes.tree;
        hash = storage.get(hash).tree;
      }

      // Serve the static blob or tree
      var type = modes.toType(mode);
      entry.hash = hash;
      entry.mode = mode;
      var overlays = [];
      entry.fetch = function (callback) {
        return storage.loadAs(root, type, hash, function (err, result) {
          if (err) return callback(err);
          if (entry.mode === modes.tree) {
            return applyOverlays(result, overlays, callback);
          }
          callback(null, result);
        });
      };
      if (entry.mode === modes.tree) {
        return loadOverlays(overlays, function (err) {
          if (err) return callback(err);
          callback(null, entry);
        });
      }
      callback(null, entry);
    }

    function loadOverlays(overlays, callback) {
      carallel(rules.map(function (rule) {
        return loadRule(path, rule);
      }), function (err, entries) {
        if (err) return callback(err);

        entries.forEach(function (entry, i) {
          if (!entry) return;
          entry.rule = rules[i];
          overlays.push(entry);
        });
        callback();
      });
    }

    function applyOverlays(tree, overlays, callback) {
      var local = {};
      var newTree = {};
      // Find local rules.
      Object.keys(tree).forEach(function (key) {
        var entry = tree[key];

        // Copy non-rules as-is
        if (entry.mode !== modes.exec || !/\.rule$/.test(key)) {
          newTree[key] = entry;
          return;
        }

        var childPath = path ? path + "/" + key : key;
        var childRule = {
          path: childPath,
          root: root,
          hash: entry.hash
        };
        key = key.substring(0, key.length - 5);
        local[key] = loadRule(childPath, childRule);
      });

      // Execute and merge in local rules
      carallel(local, function (err, results) {
        if (err) return callback(err);
        Object.keys(results).forEach(function (key) {
          if (!newTree[key]) {
            var entry = results[key];
            newTree[key] = entry;
          }
        });
        next();
      });

      // Execute overlays in order, deepest first.
      function next() {
        var overlay;
        do {
          overlay = overlays.pop();
          if (!overlay) {
            return callback(null, newTree);
          }
        } while (overlay.mode !== modes.tree);
        overlay.fetch(onTree);
      }

      function onTree(err, extra) {
        if (err) return callback(err);
        Object.keys(extra).forEach(function (key) {
          if (!newTree[key]) {
            newTree[key] = extra[key];
          }
        });
        next();
      }
    }
  }
}

});
