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
var importEntry = require('data/importfs');

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

fs.onChange(onRootChange);

rootEl.addEventListener("click", onGlobalClick, false);
rootEl.addEventListener("contextmenu", onGlobalContextMenu, false);

fs.readTree("", onRoots);

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

function createFile(row) {
  dialog.prompt("Enter name for new file", "", function (name) {
    row.busy++;
    fs.makeUnique(row.path + "/" + name, function (err, path) {
      if (err) fail(row.path, err);
      fs.setMode(path, modes.file, function (err) {
        row.busy--;
        if (err) fail(row.path, err);
      });
    });
  });
}

function createFolder(row) {
  dialog.prompt("Enter name for new folder", "", function (name) {
    row.busy++;
    fs.makeUnique(row.path + "/" + name, function (err, path) {
      if (err) fail(row.path, err);
      openPaths[path] = true;
      prefs.save();
      fs.setMode(path, modes.tree, function (err) {
        row.busy--;
        if (err) fail(row.path, err);
      });
    });
  });
}

function createSymLink(row) {
  dialog.multiEntry("Create SymLink", [
    {name: "target", placeholder: "target", required:true},
    {name: "name", placeholder: "name"},
  ], onResult);

  function onResult(result) {
    if (!result) return;
    row.busy++;
    var name = result.name || result.target.substring(result.target.lastIndexOf("/") + 1);
    fs.makeUnique(row.path + "/" + name, function (err, path) {
      if (err) fail(row.path, err);
      fs.writeLink(path, result.target, function (err) {
        row.busy--;
        if (err) fail(row.path, err);
      });
    });
  }
}

function importFolder(row) {
  var path, dir;
  return chrome.fileSystem.chooseEntry({ type: "openDirectory"}, onDir);

  function onDir(result) {
    if (!result) return;
    dir = result;
    row.busy++;
    fs.makeUnique(row.path + "/" + dir.name, onPath);
  }

  function onPath(err, result) {
    if (err) fail(row.path, err);
    path = result;
    fs.readEntry(path, onEntry);
  }

  function onEntry(err, $, repo) {
    if (err) fail(row.path, err);
    importEntry(repo, dir, onHash);
  }

  function onHash(err, hash) {
    if (err) fail(row.path, err);
    openPaths[path] = true;
    fs.writeEntry(path, {
      mode: modes.tree,
      hash: hash
    }, onWrite);
  }

  function onWrite(err) {
    row.busy--;
    if (err) fail(row.path, err);
  }
}

function addSubmodule(row) {
  var url, name;
  dialog.multiEntry("Add a submodule", [
    {name: "url", placeholder: "git@hostname:path/to/repo.git", required:true},
    {name: "name", placeholder: "localname"}
  ], function (result) {
    if (!result) return;
    row.busy++;
    url = result.url;
    // Assume github if user/name combo is given
    if (/^[^\/:@]+\/[^\/:@]+$/.test(url)) {
      url = "git@github.com:" + url + ".git";
    }
    name = result.name || result.url.substring(result.url.lastIndexOf("/") + 1);
    fs.makeUnique(row.path + "/" + name, onPath);
  });


  function onPath(err, path) {
    if (err) fail(row.path, err);
    fs.addSubModule(path, url, onWrite);
  }

  function onWrite(err) {
    row.busy--;
    if (err) fail(row.path, err);
  }
}

function toggleExec(row) {
  var newMode = row.mode === modes.exec ? modes.file : modes.exec;
  row.busy++;
  fs.setMode(row.path, newMode, function (err) {
    row.busy--;
    if (err) fail(row.path, err);
  });
}

function moveEntry(row) {
  var index = row.path.indexOf("/");
  var root = row.path.substring(0, index);
  var localPath = row.path.substring(index + 1);
  dialog.prompt("Enter target path for move", localPath, function (newPath) {
    if (!newPath || newPath === localPath) return;
    row.busy++;
    fs.moveEntry(row.path, root + "/" + newPath, function (err) {
      row.busy--;
      if (err) fail(row.path, err);
    });
  });
}

function copyEntry(row) {
  var index = row.path.indexOf("/");
  var root = row.path.substring(0, index);
  var localPath = row.path.substring(index + 1);
  dialog.prompt("Enter target path for copy", localPath, function (newPath) {
    if (!newPath || newPath === localPath) return;
    row.busy++;
    fs.copyEntry(row.path, root + "/" + newPath, function (err) {
      row.busy--;
      if (err) fail(row.path, err);
    });
  });
}

function removeEntry(row) {
  dialog.confirm("Are you sure you want to remove " + row.path + "?", function (confirm) {
    if (!confirm) return;
    row.busy++;
    fs.deleteEntry(row.path, function (err) {
      row.busy--;
      if (err) fail(row.path, err);
    });
  });
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
  // indexedDB.deleteDatabase("tedit");
  prefs.clearSync(["treeConfig", "openPaths", "activePath", "hookConfig"], chrome.runtime.reload);
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
             row.path.indexOf("/") < 0 ? "Repo" : "Submodule";
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
  // if (row.mode === modes.commit) {
  //   if (config.head !== config.current) {
  //     actions.push({sep:true});
  //     actions.push({icon:"floppy", label:"Commit Changes", action: commitChanges});
  //     actions.push({icon:"ccw", label:"Revert all Changes", action: revertChanges});
  //   }
  //   actions.push({sep:true});
  //   if (config.githubName) {
  //     actions.push({icon:"github", label:"Check for Updates", action: checkHead});
  //   }
  //   else {
  //     actions.push({icon:"download-cloud", label:"Pull from Remote"});
  //     actions.push({icon:"upload-cloud", label:"Push to Remote"});
  //   }
  // }
  else if (modes.isFile(row.mode)) {
    actions.push({sep:true});
    var label = (row.mode === modes.exec) ?
      "Make not Executable" :
      "Make Executable";
    actions.push({icon:"asterisk", label: label, action: toggleExec});
  }
  actions.push({sep:true});
  if (row.path.indexOf("/") >= 0) {
    actions.push({icon:"pencil", label:"Move " + type, action: moveEntry});
    actions.push({icon:"docs", label:"Copy " + type, action: copyEntry});
    actions.push({icon:"trash", label:"Delete " + type, action: removeEntry});
  }
  else {
    actions.push({icon:"pencil", label:"Rename Repo"});
    actions.push({icon:"trash", label:"Remove Repo"});
  }
  // actions.push({sep:true});
  // actions.push({icon:"globe", label:"Serve Over HTTP"});
  // actions.push({icon:"hdd", label:"Live Export to Disk", action: liveExport});
  if (actions[0].sep) actions.shift();
  return actions;
}
