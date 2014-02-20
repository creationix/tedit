/* global chrome*/
var rootEl = require('./elements').tree;
var fs = require('data/fs');
var makeRow = require('./row');
var modes = require('js-git/lib/modes');
var prefs = require('./prefs');
var setDoc = require('data/document');
var dialog = require('./dialog');
var contextMenu = require('./context-menu');
var importEntry = require('data/importfs');
var rescape = require('data/rescape');

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
  console.log("onRootChange", {root:root,hash:hash})
  renderChild(root, name, modes.commit, hash);
}

function onRoots(err, tree, hash) {
  if (err) throw err;
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
  if (!name) name = path.substring(path.lastIndexOf("/") + 1);
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
    row.call(fs.readCommit, onCommit);
  }
  if ((mode === modes.tree) && openPaths[path]) openTree(row);
  if (activePath === path) activateDoc(row);

  return row;

  function onCommit(commit, hashes) {
    if (!commit) throw new Error("Missing commit " + path);
    row.hash = hashes.current;
    row.treeHash = commit.tree;
    row.staged = fs.isDirty(path);
    row.title = commit.author.date.toString() + "\n" + commit.author.name + " <" + commit.author.email + ">\n\n" + commit.message.trim();
    if (openPaths[path]) openTree(row);
  }

}

function renderChildren(row, tree) {
  var path = row.path;

  trim(path, tree);

  // renderChild will cache rows that have been seen already, so it's effecient
  // to simply remove all children and then re-add the ones still here all in
  // one tick. Also we don't have to worry about sort order because that's
  // handled internally by row.addChild().
  row.removeChildren();

  // Add back all the immediate children.
  var names = Object.keys(tree);
  for (i = 0, l = names.length; i < l; i++) {
    var name = names[i];
    var entry = tree[name];
    var child = renderChild(path + "/" + name, name, entry.mode, entry.hash);
    row.addChild(child);
  }
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
  row.open = true;
  row.call(fs.readTree, function (tree) {
    if (!tree) throw new Error("Missing tree");
    openPaths[path] = true;
    prefs.save();
    renderChildren(row, tree);
  });
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
  row.call(fs.readFile, function (blob) {
    setDoc(row, blob);
  });
}

function updateDoc(row, body) {
  row.call(fs.writeFile, body);
}

function commitChanges(row) {
  row.call(fs.readCommit, function (current, hashes) {
    var githubName = fs.isGithub(row.path);
    if (githubName) {
      var previewDiff = "https://github.com/" + githubName + "/commit/" + hashes.current;
      window.open(previewDiff);
    }
    var userName = prefs.get("userName", "");
    var userEmail = prefs.get("userEmail", "");
    dialog.multiEntry("Enter Commit Message", [
      {name: "message", placeholder: "Details about commit.", required:true},
      {name: "name", placeholder: "Full Name", required:true, value:userName},
      {name: "email", placeholder: "email@provider.com", required:true, value:userEmail},
    ], function onResult(result) {
      if (!result) return;
      if (result.name !== userName) prefs.set("userName", result.name);
      if (result.email !== userEmail) prefs.set("userEmail", result.email);
      var commit = {
        tree: current.tree,
        author: {
          name: result.name,
          email: result.email
        },
        parent: hashes.head,
        message: result.message
      };
      row.call(fs.writeCommit, commit);
    });
  });
}

function revertChanges(row) {
  dialog.confirm("Are you sure you want to lose all uncommitted changes?", function (confirm) {
    if (!confirm) return;
    row.call(fs.revertToHead);
  });
}

function editSymLink(row) {
  row.call(fs.readLink, function (target, hash) {
    if (target === undefined) throw new Error("Missing SymLink " + row.path);
    var index = row.path.lastIndexOf("/");
    var name = row.path.substring(index + 1);
    var dir = row.path.substring(0, index);
    dialog.multiEntry("Edit SymLink", [
      {name: "target", placeholder: "target", required:true, value: target},
      {name: "name", placeholder: "name", required:true, value: name},
    ], function (result) {
      if (!result) return;
      result.name = result.name.substring(result.name.indexOf("/") + 1);
      if (!result) return;
      if (target === result.target) {
        if (name === result.name) return;
        return onHash(hash);
      }
      row.call(fs.saveAs, "blob", result.target, onHash);

      function onHash(hash) {
        // If the user changed the path, we need to move things
        if (name !== result.name) {
          row.call(fs.writeEntry, {});
          var path = dir + "/" + result.name;
          rename(row.path, uniquePath(path, rows));
        }
        // Write the symlink
        row.call(fs.writeEntry, {
          mode: modes.sym,
          hash: hash
        });
      }
    });
  });
}

function makeUnique(row, name, mode, callback) {
  // Walk the path making sure we don't overwrite existing files.
  var parts = splitPath(name);
  var path = row.path, index = 0;
  row.call(fs.readTree, onTree);

  function onTree(tree) {
    var name = parts[index];
    var entry = tree[name];
    if (!entry) return onUnique();
    if (entry.mode === modes.tree && index < parts.length - 1) {
      index++;
      path += "/" + name;
      return row.call(path, fs.readTree, onTree);
    }
    parts[index] = uniquePath(name, tree);
    onUnique();
  }

  function onUnique() {
    path = row.path + "/" + parts.join("/");
    var dirParts = mode === modes.tree ? parts : parts.slice(0, parts.length - 1);
    if (dirParts.length) {
      var dirPath = row.path;
      dirParts.forEach(function (name) {
        dirPath += "/" + name;
        openPaths[dirPath] = true;
      });
      prefs.save();
    }
    callback(path);
  }
}

function addChild(row, name, mode, hash) {
  makeUnique(row, name, mode, function (path) {
    if (modes.isFile(mode)) activePath = path;
    row.call(path, fs.writeEntry, {
      mode: mode,
      hash: hash
    });
  });
}

function createFile(row) {
  dialog.prompt("Enter name for new file", "", function (name) {
    if (!name) return;
    row.call(fs.saveAs, "blob", "", function (hash) {
      addChild(row, name, modes.file, hash);
    });
  });
}

function createFolder(row) {
  dialog.prompt("Enter name for new folder", "", function (name) {
    if (!name) return;
    row.call(fs.saveAs, "tree", [], function (hash) {
      addChild(row, name, modes.tree, hash);
    });
  });
}

function createSymLink(row) {
  dialog.multiEntry("Create SymLink", [
    {name: "target", placeholder: "target", required:true},
    {name: "name", placeholder: "name"},
  ], function (result) {
    if (!result) return;
    var name = result.name || result.target.substring(result.target.lastIndexOf("/") + 1);
    row.call(fs.saveAs, "blob", result.target, function (hash) {
      addChild(row, name, modes.sym, hash);
    });
  });
}

function importFolder(row) {
  chrome.fileSystem.chooseEntry({ type: "openDirectory"}, function (dir) {
    if (!dir) return;
    row.call(fs.customImport, function (repo, callback) {
      importEntry(repo, dir, callback);
    }, function (hash) {
      addChild(row, dir.name, modes.tree, hash);
    });
  });
}

function addSubmodule(row) {
  var url, name;
  dialog.multiEntry("Add a submodule", [
    {name: "url", placeholder: "git@hostname:path/to/repo.git", required:true},
    {name: "name", placeholder: "localname"}
  ], onResult);

  function onResult(result) {
    if (!result) return;
    url = result.url;
    // Assume github if user/name combo is given
    if (/^[^\/:@]+\/[^\/:@]+$/.test(url)) {
      url = "git@github.com:" + url + ".git";
    }
    name = result.name || result.url.substring(result.url.lastIndexOf("/") + 1);
    row.busy++;
    fs.makeUnique(row.path + "/" + name, onPath);
  }


  function onPath(err, path) {
    row.busy--;
    if (err) fail(row.path, err);
    row.busy++;
    fs.addSubModule(path, url, onWrite);
  }

  function onWrite(err) {
    row.busy--;
    if (err) fail(row.path, err);
  }
}

function toggleExec(row) {
  var newMode = row.mode === modes.exec ? modes.file : modes.exec;
  row.call(fs.readEntry, function (entry) {
    row.call(fs.writeEntry, {
      mode: row.mode = newMode,
      hash: entry.hash
    });
  });
}

function moveEntry(row) {
  var index = row.path.indexOf("/");
  var root = row.path.substring(0, index);
  var localPath = row.path.substring(index + 1);
  dialog.prompt("Enter target path for move", localPath, function (newPath) {
    if (!newPath || newPath === localPath) return;
    var rootRow = rows[root];
    makeUnique(rootRow, newPath, row.mode, function (path) {
      if (modes.isFile(row.mode)) activePath = path;
      row.call(fs.writeEntry, {});
      rename(row.path, path);
      row.call(fs.writeEntry, {
        mode: row.mode,
        hash: row.hash
      });
    });
  });
}

function copyEntry(row) {
  var index = row.path.indexOf("/");
  var root = row.path.substring(0, index);
  var localPath = row.path.substring(index + 1);
  dialog.prompt("Enter target path for copy", localPath, function (newPath) {
    if (!newPath || newPath === localPath) return;
    var rootRow = rows[root];
    makeUnique(rootRow, newPath, row.mode, function (path) {
      if (modes.isFile(row.mode)) activePath = path;
      rootRow.call(path, fs.writeEntry, {
        mode: row.mode,
        hash: row.hash
      });
    });
  });
}

function removeEntry(row) {
  dialog.confirm("Are you sure you want to delete " + row.path + "?", function (confirm) {
    if (!confirm) return;
    remove(row.path);
    row.call(fs.writeEntry, {});
  });
}

function renameRepo(row) {
  dialog.prompt("Enter new name for repo", row.path, function (name) {
    if (!name || name === row.path) return;
    try {
      name = fs.renameRoot(row.path, name);
      rename(row.path, name);
    }
    catch (err) {
      row.errorMessage = err.toString();
      throw err;
    }
    fs.readTree("", onRoots);
  });
}

function removeRepo(row) {
  dialog.confirm("Are you sure you want to delete " + row.path + "?", function (confirm) {
    if (!confirm) return;
    try {
      fs.removeRoot(row.path);
      remove(row.path);
    }
    catch (err) {
      row.errorMessage = err.toString();
      throw err;
    }
    fs.readTree("", onRoots);
  });
}

function createEmpty() {
  dialog.prompt("Enter name for empty repo", "", function (name) {
    if (!name) return;
    addRoot(name, {});
  });
}

function createFromFolder() {
  return chrome.fileSystem.chooseEntry({ type: "openDirectory"}, function (entry) {
    if (!entry) return;
    addRoot(entry.name, {entry:entry});
  });
}

function createClone() {
  dialog.multiEntry("Clone Remote Repo", [
    {name: "url", placeholder: "git@hostname:path/to/repo.git", required : true},
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
  dialog.confirm("Are you sure you want to reset app to factory settings?", function (confirm) {
    if (!confirm) return;
    window.indexedDB.deleteDatabase("tedit");
    chrome.storage.local.clear();
    chrome.runtime.reload();
  });
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
  if (row.mode === modes.commit) {
    if (fs.isDirty(row.path)) {
      actions.push({sep:true});
      actions.push({icon:"floppy", label:"Commit Changes", action: commitChanges});
      actions.push({icon:"ccw", label:"Revert all Changes", action: revertChanges});
    }
    // if (!config.githubName) {
    //   actions.push({sep:true});
    //   actions.push({icon:"download-cloud", label:"Pull from Remote"});
    //   actions.push({icon:"upload-cloud", label:"Push to Remote"});
    // }
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
    actions.push({icon:"pencil", label:"Move " + type, action: moveEntry});
    actions.push({icon:"docs", label:"Copy " + type, action: copyEntry});
    actions.push({icon:"trash", label:"Delete " + type, action: removeEntry});
  }
  else {
    actions.push({icon:"pencil", label:"Rename Repo", action: renameRepo});
    actions.push({icon:"trash", label:"Remove Repo", action: removeRepo});
  }
  // actions.push({sep:true});
  // actions.push({icon:"globe", label:"Serve Over HTTP"});
  // actions.push({icon:"hdd", label:"Live Export to Disk", action: liveExport});
  if (actions[0].sep) actions.shift();
  return actions;
}

function remove(oldPath) {
  var regExp = new RegExp("^" + rescape(oldPath) + "(?=$|/)");
  var paths = Object.keys(rows);
  for (var i = 0, l = paths.length; i < l; i++) {
    var path = paths[i];
    if (!regExp.test(path)) continue;
    delete rows[path];
    if (openPaths[path]) delete openPaths[path];
  }
  fs.removeRoots(regExp);
  prefs.save();
}

function rename(oldPath, newPath) {
  var regExp = new RegExp("^" + rescape(oldPath) + "(?=$|/)");
  var paths = Object.keys(rows);
  for (var i = 0, l = paths.length; i < l; i++) {
    var path = paths[i];
    if (!regExp.test(path)) continue;
    var replacedPath = path.replace(regExp, newPath);
    var row = rows[replacedPath] = rows[path];
    row.path = replacedPath;
    delete rows[path];
    if (openPaths[path]) {
      openPaths[replacedPath] = true;
      delete openPaths[path];
    }
  }
  fs.renameRoots(regExp, newPath);
  prefs.save();
}

function trim(path, tree) {
  // Trim rows that are not in the tree anymore.  I welcome a more effecient way
  // to do this than scan over the entire list looking for patterns.
  var regExp = new RegExp("^" + rescape(path) + "\/([^\/]+)(?=\/|$)");
  var paths = Object.keys(rows);
  for (var i = 0, l = paths.length; i < l; i++) {
    var childPath = paths[i];
    var match = childPath.match(regExp);
    if (match && !tree[match[1]]) {
      delete rows[childPath];
      if (openPaths[childPath]) delete openPaths[childPath];
    }
  }
  fs.trimRoots(regExp, tree);
}

// Make a path unique
function uniquePath(name, obj) {
  var base = name;
  var i = 1;
  while (name in obj) {
    name = base + "-" + (++i);
  }
  return name;
}

function splitPath(path) {
  return path.split("/").map(function (part) {
    return part.replace(/[^a-z0-9#.+!*'()_\- ]*/g, "").trim();
  }).filter(Boolean);
}