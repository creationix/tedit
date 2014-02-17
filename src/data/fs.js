/*
This is a mutable filesystem abstraction on top of the repos tree.
This handles write batching / transactions, retry logic, etc.

Each tree is independent in terms of transactions.
If a new write starts while an old write was saving, the old save is canceled.
All writes are stored in a global change list so that retry and transactions work
Reads check the in-progress writes first so that data is available immedietly
Reads for trees still calculating their hash will wait for the data instead of loading old data.
The UI needs to show spinners for all writes in progress, this includes parent folders.
This way the user can see what's going on.  There need to be timeouts that auto-fail slow writes


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
var pathJoin = require('pathjoin');
var binary = require('bodec');

module.exports = {
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
  // (path) => mode, hash
  getMode: getMode,
  // (path) => newPath
  makeUnique: makeUnique,
  // (path) => repo
  getRepo: getRepo,

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

var roots = {};

////////////////////////////////////////////////////////////////////////////////

// (name, config) => newName
function addRoot(name, config, callback) {
  expandConfig(config, function (err) {
    if (err) return callback(err);
    name = genName(name, roots);
    config.root = name;
    roots[name] = config;
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

function pathToEntry(path, callback) {
  var parts = path.split("/").filter(Boolean);
  var index = 0;

  var root = parts[index++];
  var rootTree;
  var config = roots[root];
  if (!config) return callback();
  if (!config.current) return callback(new Error("Missing current hash for " + path));
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
        if (!entry) return callback();
        path += "/" + part;
        mode = entry.mode;
        hash = entry.hash;
        if (mode === modes.commit) {
          if (roots[path]) {
            root = path;
            config = roots[root];
            repo = findStorage(config).repo;
          }
          else {
            return loadSubModule(repo, config, rootTree, root, path, onSubConfig);
          }
        }
        continue;
      }
      return callback();
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
    config = roots[root] = subConfig;
    repo = findStorage(config).repo;
    return walk();
  }

}


////////////////////////////////////////////////////////////////////////////////

// (path) => tree, hash
function readTree(path, callback) {
  if (!callback) return readTree.bind(null, path);
  if (!path) return readRootTree(callback);
  return pathToEntry(path, onEntry);

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
  var names = Object.keys(roots).sort();
  var tree = {};
  names.forEach(function (name) {
    tree[name] = {
      mode: modes.commit,
      hash: roots[name].current
    };
  });
  callback(null, tree, hashAs("tree", tree));
}

// (path) => commit, hash
function readCommit(path, callback) {
  if (!callback) return readCommit.bind(null, path);
  pathToEntry(path, function (err, entry, repo) {
    if (!entry) return callback(err);
    if (entry.mode !== modes.commit) return callback("Not a commit " + path);
    repo.loadAs("commit", entry.hash, callback);
  });
}

// (path) => blob, hash
function readFile(path, callback) {
  if (!callback) return readFile.bind(null, path);
  pathToEntry(path, function (err, entry, repo) {
    if (entry === undefined) return callback(err);
    if (!modes.isFile(entry.mode)) return callback("Not a file " + path);
    repo.loadAs("blob", entry.hash, callback);
  });
}

// (path) => target, hash
function readLink(path, callback) {
  if (!callback) return readLink.bind(null, path);
  pathToEntry(path, onEntry);

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
  callback("TODO: getRepo");
}

////////////////////////////////////////////////////////////////////////////////

// (path, blob) => hash
function writeFile(path, blob, callback) {
  if (!callback) return writeFile.bind(null, path, blob);
  callback("TODO: writeFile");
}

// (path, target) => hash
function writeLink(path, target, callback) {
  if (!callback) return writeLink.bind(null, path, target);
  callback("TODO: writeLink");
}

// (path) =>
function deleteEntry(path, callback) {
  if (!callback) return deleteEntry.bind(null, path);
  callback("TODO: deleteEntry");
}

// (oldPath, newPath) =>
function moveEntry(oldPath, newPath, callback) {
  if (!callback) return moveEntry.bind(null, oldPath, newPath);
  callback("TODO: moveEntry");
}

// (oldPath, newPath) =>
function copyEntry(oldPath, newPath, callback) {
  if (!callback) return copyEntry.bind(null, oldPath, newPath);
  callback("TODO: copyEntry");
}

// Create or update an entry.  If it doesn't exist, create an empty file or folder
// If it exists and the old mode is compatable, update the mode
// (path, mode) =>
function setMode(path, mode, callback) {
  if (!callback) return setMode.bind(null, path, mode);
  callback("TODO: setMode");
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
