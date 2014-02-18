/* global chrome*/
var rootEl = require('./elements').tree;
var fs = require('data/fs');
var makeRow = require('./row');
var modes = require('js-git/lib/modes');
var prefs = require('./prefs');
var setDoc = require('data/document');
var dialog = require('./dialog');
var carallel = require('carallel');
var contextMenu = require('./context-menu');

setDoc.updateDoc = updateDoc;
setDoc.setActive = setActive;

// Memory for opened trees.  Accessed by path
var openPaths = prefs.get("openPaths", {});

// Basic check to know if nothing has changed in the root.
var rootHash;
// Rows indexed by path
var rows = {};

var active;
// Remember the path to the active document.
var activePath = prefs.get("activePath", "");

addRoot("conquest", {url:"git@github.com:creationix/conquest.git"});
// addRoot("tedit-app", {githubName:"creationix/tedit-app"});

fs.onChange(onRootChange);

rootEl.addEventListener("click", onGlobalClick, false);
rootEl.addEventListener("contextmenu", onGlobalContextMenu, false);


function addRoot(name, config) {
  name = fs.addRoot(name, config);
  openPaths[name] = true;
  fs.readTree("", onRoots);
}


function onRootChange(root, hash) {
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

function onGlobalContextMenu(evt) {
  nullify(evt);
  var row = findRow(evt.target);
  var menu = makeMenu(row);
  contextMenu(evt, row, menu);
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

function setActive(path) {
  var row = rows[path];
  var old = active;
  active = row;
  activePath = active ? active.path : null;
  prefs.set("activePath", activePath);
  if (old) old.active = false;
  if (active) active.active = true;
}

function activateDoc(row) {
  var path = row.path;
  setActive(path);
  if (!active) return setDoc();
  row.busy++;
  fs.readFile(path, onFile);

  function onFile(err, blob) {
    row.busy--;
    if (!blob) fail(path, err || new Error("Problem loading doc " + path));
    try { setDoc(row, blob); }
    catch (err) {  fail(row.path, err);  }
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

function createEmpty() {
  dialog.prompt("Enter name for empty repo", "", function (name) {
    if (!name) return;
    addRoot(name, {});
  });
}

function createFromFolder() {
  return chrome.fileSystem.chooseEntry({ type: "openDirectory"}, onEntry);

  function onEntry(entry) {
    if (!entry) return;
    addRoot(entry.name, {entry:entry});
  }
}

function createClone() {
  dialog.multiEntry("Clone Remote Repo", [
    {name: "url", placeholder: "git@hostname:path/to/repo.git", required:true},
    {name: "name", placeholder: "localname"}
  ], function (result) {
    if (!result) return;
    addRoot(result.name || result.url, { url: result.url });
  });
}

function createGithubMount() {
  var githubToken = prefs.get("githubToken", "");
  dialog.multiEntry("Mount Github Repo", [
    {name: "path", placeholder: "user/name", required:true},
    {name: "name", placeholder: "localname"},
    {name: "token", placeholder: "Enter github auth token", required:true, value: githubToken}
  ], function (result) {
    if (!result) return;
    if (result.token !== githubToken) {
      prefs.set("githubToken", result.token);
    }
    addRoot(result.name || result.path, { githubName: result.path });
  });
}

function removeAll() {
  throw "TODO: implement removeAll";
  // // indexedDB.deleteDatabase("tedit");
  // prefs.clearSync(["treeConfig", "openPaths", "activePath", "hookConfig"], chrome.runtime.reload);
}


function makeMenu(row) {
  if (!row) {
    return [
      {icon:"git", label: "Create Empty Git Repo", action: createEmpty},
      {icon:"hdd", label:"Create Repo From Folder", action: createFromFolder},
      {icon:"fork", label: "Clone Remote Repo", action: createClone},
      {icon:"github", label: "Live Mount Github Repo", action: createGithubMount},
      {icon:"ccw", label: "Remove All", action: removeAll}
    ];
  }
  var actions = [];
  var type = row.mode === modes.tree ? "Folder" :
             modes.isFile(row.mode) ? "File" :
             row.mode === modes.sym ? "SymLink" :
             onChange ? "Repo" : "Submodule";
  if (row.mode === modes.tree || row.mode === modes.commit) {
    if (openPaths[row.path]) {
      actions.push({icon:"doc", label:"Create File", action: createFile});
      actions.push({icon:"folder", label:"Create Folder", action: createFolder});
      actions.push({icon:"link", label:"Create SymLink", action: createSymLink});
      actions.push({sep:true});
      actions.push({icon:"fork", label: "Add Submodule", action: addSubmodule});
      actions.push({icon:"folder", label:"Import Folder", action: importFolder});
    }
  }
  if (row.mode === modes.commit) {
    if (config.head !== config.current) {
      actions.push({sep:true});
      actions.push({icon:"floppy", label:"Commit Changes", action: commitChanges});
      actions.push({icon:"ccw", label:"Revert all Changes", action: revertChanges});
    }
    actions.push({sep:true});
    if (config.githubName) {
      actions.push({icon:"github", label:"Check for Updates", action: checkHead});
    }
    else {
      actions.push({icon:"download-cloud", label:"Pull from Remote"});
      actions.push({icon:"upload-cloud", label:"Push to Remote"});
    }
  }
  else if (modes.isFile(row.mode)) {
    actions.push({sep:true});
    var label = (row.mode === modes.exec) ?
      "Make not Executable" :
      "Make Executable";
    actions.push({icon:"asterisk", label: label, action: toggleExec});
  }
  actions.push({sep:true});
  if (row.path.indexOf("/") >= 0) {
    actions.push({icon:"pencil", label:"Rename " + type, action: renameEntry});
    actions.push({icon:"trash", label:"Delete " + type, action: removeEntry});
  }
  else {
    actions.push({icon:"pencil", label:"Rename Repo"});
    actions.push({icon:"trash", label:"Remove Repo"});
  }
  actions.push({sep:true});
  actions.push({icon:"globe", label:"Serve Over HTTP"});
  actions.push({icon:"hdd", label:"Live Export to Disk", action: liveExport});
  if (actions[0].sep) actions.shift();
  return actions;
}
