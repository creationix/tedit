var rootEl = require('./elements').tree;
var fs = require('data/fs');
var makeRow = require('./row');
var findStorage = require('data/storage');
var modes = require('js-git/lib/modes');
var prefs = require('./prefs');
var editor = require('./editor');
var newDoc = require('data/document');
var dialog = require('./dialog');
var carallel = require('carallel');

// Memory for opened trees.  Accessed by path
var openPaths = prefs.get("openPaths", {});

// Basic check to know if nothing has changed in the root.
var rootHash;
// Rows indexed by path
var rows = {};

var active;
// Remember the path to the active document.
var activePath = prefs.get("activePath", "");

fs.addRoot("test", {githubName:"creationix/tedit-app"}, function (err, name) {
  if (err) fail("", err);
  openPaths[name] = true;
  fs.readTree("", onRoots);
});

fs.onChange(onRootChange);

rootEl.addEventListener("click", onGlobalClick, false);

function onRootChange(root, hash) {
  console.log("ROOT CHANGED", root, hash);
  var name = root.substring(root.lastIndexOf("/") + 1);
  renderChild(root, name, modes.commit, hash);
}

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
  var row = rows[path];
  if (row) {
    row.mode = mode;
    row.errorMessage = "";
    // Skip nodes that haven't changed
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
  if ((mode === modes.tree) && openPaths[path]) openTree(row);
  if (activePath === path) activateDoc(row);

  return row;

  function onCommit(err, commit, hash) {
    row.busy--;
    if (!commit) fail(path, err || new Error("Missing commit " + path));
    row.hash = hash;
    row.treeHash = commit.tree;
    row.staged = row.hash !== fs.configs[path].head;
    row.title = commit.author.date.toString() + "\n" + commit.author.name + " <" + commit.author.email + ">\n\n" + commit.message.trim();
    if (openPaths[path]) openTree(row);
  }

}

function renderChildren(row, tree) {
  var path = row.path;
  // renderChild will cache rows that have been seen already, so it's effecient
  // to simply remove all children and then re-add the ones still here all in
  // one tick. Also we don't have to worry about sort order because that's
  // handled internally by row.addChild().
  row.removeChildren();
  Object.keys(tree).forEach(function (name) {
    var entry = tree[name];
    var child = renderChild(path + "/" + name, name, entry.mode, entry.hash);
    row.addChild(child);
  });
}

function fail(path, err) {
  var row = rows[path];
  if (row) row.errorMessage = err.toString();
  else console.error("Problem at " + path + "...");
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
  else if (modes.isFile(row.mode)) {
    activateDoc(row);
  }
  else if (row.mode === modes.sym) {
    editSymLink(row);
  }
  else {
    console.log("TODO: handle click", row);
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

function activateDoc(row) {
  var old = active;
  active = row;
  activePath = active ? active.path : null;
  prefs.set("activePath", activePath);
  if (old) old.active = false;
  if (active) active.active = true;
  if (!active) return editor.setDoc();
  if (active === old) return;
  var storage = findStorage(row);
  var doc;
  row.busy++;
  fs.readFile(row.path, onBlob);

  function onBlob(err, blob) {
    row.busy--;
    if (err) fail(row.path, err);
    doc = storage.doc;
    try {
      if (doc) doc.update(row.path, row.mode, blob);
      else {
        doc = storage.doc = newDoc(row.path, row.mode, blob);
        doc.updateTree = updateDoc.bind(null, row);
      }
      doc.activate();
    }
    catch (err) {
      fail(row.path, err);
    }
  }
}

function updateDoc(row, body) {
  row.busy++;
  fs.writeFile(row.path, body, function (err) {
    row.busy--;
    if (err) fail(row.path, err);
  });
}

function editSymLink(row) {
  var target;
  row.busy++;
  fs.readLink(row.path, function (err, result) {
    row.busy--;
    target = result;
    if (target === undefined) fail(row.path, err || new Error("Missing SymLink " + row.path));
    dialog.multiEntry("Edit SymLink", [
      {name: "target", placeholder: "target", required:true, value: target},
      {name: "path", placeholder: "path", required:true, value: row.path},
    ], onResult);
  });

  function onResult(result) {
    if (!result) return;
    if (result.path === row.path) {
      if (target === result.target) return;
      row.busy++;
      return fs.writeLink(result.path, result.target, function (err) {
        row.busy--;
        if (err) fail(row.path, err);
      });
    }
    row.busy++;
    fs.makeUnique(result.path, function (err, path) {
      row.busy--;
      if (err) fail(row.path, err);
      row.busy++;
      carallel([
        fs.writeLink(path, result.target),
        fs.deleteEntry(row.path)
      ], function (err) {
        row.busy--;
        if (err) fail(row.path, err);
      });
    });
  }
}
