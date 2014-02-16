var rootEl = require('./elements').tree;
var fs = require('data/fs');
var makeRow = require('./row');
var modes = require('js-git/lib/modes');

console.log({
  rootEl: rootEl,
  fs: fs
});

// Basic check to know of nothing has changed in the root.
var rootHash;

fs.addRoot("test", {githubName:"creationix/tedit-app"}, function (err) {
  if (err) fail("", err);
  fs.readTree("", onRoots);
});

function onRoots(err, tree, hash) {
  if (err) fail("", err);
  if (hash === rootHash) return;
  rootHash = hash;
  rootEl.textContent = "";
  Object.keys(tree).sort().map(function (name) {
    var entry = tree[name];
    var child = renderChild(name, name, entry.mode, entry.hash);
    rootEl.appendChild(child.el);
  });
}

function renderChild(path, name, mode, hash, parent) {
  // console.log("renderChild", arguments);
  var row = makeRow(path, mode, hash);
  if (mode === modes.commit) {
    row.busy++;
    fs.readCommit(path, onCommit);
  }
  // TODO: look up openPaths config instead of hard-coding to true
  if ((mode === modes.tree) && true) {
    row.busy++;
    fs.readTree(path, onTree);
  }
  return row;

  function onCommit(err, commit) {
    row.busy--;
    if (!commit) fail(path, err || new Error("Missing commit " + path));
    row.treeHash = commit.tree;
    // TODO: look up openPaths config instead of hard-coding to true
    if (true) {
      row.busy++;
      fs.readTree(path, onTree);
    }
  }

  function onTree(err, tree) {
    row.busy--;
    if (!tree) fail(path, err || new Error("Missing tree " + path));
    Object.keys(tree).forEach(function (name) {
      var entry = tree[name];
      var child = renderChild(path + "/" + name, name, entry.mode, entry.hash);
      row.addChild(child);
    });
  }
}

function renderCommit(path) {
  fs.readCommit(path, onCommit);

  function onCommit(err, commit, hash) {

  }
}

function fail(path, err) {
  console.error("Problem at " + path + "...");
  throw err;
}
