var rootEl = require('./elements').tree;
var fs = require('data/fs');
var makeRow = require('./row');
var modes = require('js-git/lib/modes');
var prefs = require('./prefs');

// Memory for opened trees.  Accessed by path
var openPaths = prefs.get("openPaths", {});

// Basic check to know if nothing has changed in the root.
var rootHash;
// Rows indexed by path
var rows = {};

fs.addRoot("test", {githubName:"creationix/tedit-app"}, function (err, name) {
  if (err) fail("", err);
  openPaths[name] = true;
  fs.readTree("", onRoots);
});

rootEl.addEventListener("click", onGlobalClick, false);

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

function renderChild(path, name, mode, hash) {
  // console.log("renderChild", arguments);
  var row = rows[path];
  if (row) {
    row.mode = mode;
    if (row.hash === hash) return row;
    row.hash = hash;
  }
  else {
    row = rows[path] = makeRow(path, mode, hash);
  }
  if (mode === modes.commit) {
    row.busy++;
    fs.readCommit(path, onCommit);
  }
  if ((mode === modes.tree) && openPaths[path]) {
    row.busy++;
    fs.readTree(path, onTree);
  }
  return row;

  function onCommit(err, commit) {
    row.busy--;
    if (!commit) fail(path, err || new Error("Missing commit " + path));
    row.treeHash = commit.tree;
    row.title = commit.author.date.toString() + "\n" + commit.author.name + " <" + commit.author.email + ">\n\n" + commit.message.trim();
    // TODO: look up openPaths config instead of hard-coding to true
    if (openPaths[path]) {
      row.busy++;
      fs.readTree(path, onTree);
    }
  }

  function onTree(err, tree) {
    row.busy--;
    if (!tree) fail(path, err || new Error("Missing tree " + path));
    renderChildren(row, tree);
  }
}

function renderChildren(row, tree) {
  var path = row.path;
  // TODO: this might be an update in which case we need to reuse as many
  // children as possible.
  Object.keys(tree).forEach(function (name) {
    var entry = tree[name];
    var child = renderChild(path + "/" + name, name, entry.mode, entry.hash);
    row.addChild(child);
  });
}

function fail(path, err) {
  console.error("Problem at " + path + "...");
  throw err;
}

function nullify(evt) {
  evt.preventDefault();
  evt.stopPropagation();
}

function findRow(element) {
  while (element !== rootEl) {
    if (element.js) return element.js;
    element = element.parentNode;
  }
}

function onGlobalClick(evt) {
  var row = findRow(evt.target);
  if (!row) return;
  nullify(evt);
  if (row.mode === modes.tree || row.mode === modes.commit) {
    if (openPaths[row.path]) closeTree(row);
    else openTree(row);
  }
  else {
    console.log("onClick", row);
  }
}

function openTree(row) {
  var path = row.path;
  row.busy++;
  row.open = true;
  fs.readTree(path, onTree);

  function onTree(err, tree) {
    row.busy--;
    if (!tree) fail(path, err || new Error("Missing tree " + path));
    openPaths[path] = true;
    prefs.save();
    renderChildren(row, tree);
  }
}

function closeTree(row) {
  row.removeChildren();
  row.open = false;
  delete openPaths[row.path];
  prefs.save();
}
