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

// Rows indexed by path
var rows = {};
var rootRow;

var active;
// Remember the path to the active document.
var activePath = prefs.get("activePath", "");

fs.init(onChange, function (err, hash) {
  if (err) throw err;
  console.log("INIT", hash);
  openPaths[""] = true;
  rootRow = renderChild("", modes.commit, hash);
  rootEl.appendChild(rootRow.el);
});

function onChange(hash) {
  console.log("CHANGE", hash);
  renderChild("", modes.commit, hash);
}

rootEl.addEventListener("click", onGlobalClick, false);
rootEl.addEventListener("contextmenu", onGlobalContextMenu, false);

function renderChild(path, mode, hash) {
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
  if (activePath && activePath === path) activateDoc(row);

  return row;

  function onCommit(entry) {
    if (!entry) throw new Error("Missing commit");
    var commit = entry.commit;
    var head = entry.head || {};
    row.hash = entry.hash;
    row.treeHash = commit.tree;
    row.staged = commit.tree !== head.tree;
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

  // Add back all the immediate children.
  var names = Object.keys(tree);
  for (var i = 0, l = names.length; i < l; i++) {
    var name = names[i];
    var entry = tree[name];
    var childPath = path ? path + "/" + name : name;
    var child = renderChild(childPath, entry.mode, entry.hash);
    row.addChild(child);
  }

  row.call(trim, tree);
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
  row.call(fs.readTree, function (entry) {
    if (!entry) throw new Error("Missing tree");
    openPaths[path] = true;
    prefs.save();
    renderChildren(row, entry.tree);
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
  row.call(fs.readBlob, function (entry) {
    setDoc(row, entry.blob);
  });
}

function updateDoc(row, body) {
  row.call(fs.readEntry, function (entry) {
    row.call(fs.saveAs, "blob", body, function (hash) {
      entry.hash = hash;
      row.call(fs.writeEntry, entry);
    });
  });
}

function commitChanges(row) {
  row.call(fs.readCommit, function (entry) {
    var githubName = fs.isGithub(row.path);
    if (githubName) {
      var previewDiff = "https://github.com/" + githubName + "/commit/" + entry.hash;
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
        tree: entry.commit.tree,
        author: {
          name: result.name,
          email: result.email
        },
        parent: entry.headHash,
        message: result.message
      };
      row.call(fs.saveAs, "commit", commit, function (hash) {
        row.call(fs.setHead, hash);
      });
    });
  });
}

function revertChanges(row) {
  dialog.confirm("Are you sure you want to lose all uncommitted changes?", function (confirm) {
    if (!confirm) return;
    row.call(fs.setCurrent, null);
  });
}

function editSymLink(row) {
  row.call(fs.readLink, function (entry) {
    var target = entry.link;
    dialog.multiEntry("Edit SymLink", [
      {name: "target", placeholder: "target", required: true, value: target},
      {name: "path", placeholder: "path", required: true, value: row.path},
    ], function (result) {
      if (!result) return;
      if (target === result.target) {
        if (row.path === result.path) return;
        return onHash(entry.hash);
      }
      row.call(fs.saveAs, "blob", result.target, onHash);
      function onHash(hash) {
        if (row.path === result.path) {
          return onPath(row.path);
        }
        // If the user changed the path, we need to move things
        makeUnique(rootRow, result.path, modes.sym, onPath);
        function onPath(path) {
          // Write the symlink
          if (path !== row.path) {
            row.call(fs.deleteEntry);
          }
          return row.call(path, fs.writeEntry, {
            mode: modes.sym,
            hash: hash
          });
        }
      }
    });
  });
}

function makeUnique(row, name, mode, callback) {
  // Walk the path making sure we don't overwrite existing files.
  var parts = splitPath(name);
  var path = row.path, index = 0;
  row.call(fs.readTree, onTree);

  function onTree(result) {
    var tree = result.tree;
    var name = parts[index];
    var entry = tree[name];
    if (!entry) return onUnique();
    if ((entry.mode === modes.tree || entry.mode === modes.commit) && index < parts.length - 1) {
      index++;
      path = path ? path + "/" + name : name;
      return row.call(path, fs.readTree, onTree);
    }
    parts[index] = uniquePath(name, tree);
    onUnique();
  }

  function onUnique() {
    path = (row.path ? row.path + "/" : "") + parts.join("/");
    var dirParts = mode === modes.tree ? parts : parts.slice(0, parts.length - 1);
    if (dirParts.length) {
      var dirPath = row.path;
      dirParts.forEach(function (name) {
        dirPath = dirPath ? dirPath + "/" + name : name;
        openPaths[dirPath] = true;
      });
      prefs.save();
    }
    callback(path);
  }
}

function addChild(row, name, mode, hash) {
  makeUnique(row, name, mode, function (path) {
    if (modes.isFile(mode)) {
      activePath = path;
    }
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
    row.call(fs.getRepo, function (repo) {
      row.call(repo, importEntry, dir, function (hash) {
        addChild(row, dir.name, modes.tree, hash);
      });
    });
  });
}

function addSubmodule(row) {
  dialog.multiEntry("Add a submodule", [
    {name: "url", placeholder: "git@hostname:path/to/repo.git", required: true},
    {name: "name", placeholder: "localname"}
  ], function (result) {
    if (!result) return;
    var url = result.url;
    // Assume github if user/name combo is given
    if (/^[^\/:@]+\/[^\/:@]+$/.test(url)) {
      url = "git@github.com:" + url + ".git";
    }
    var name = result.name || result.url.substring(result.url.lastIndexOf("/") + 1);
    makeUnique(row, name, modes.commit, function (path) {
      row.call(path, fs.writeSubmodule, url);
    });
  });
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
  dialog.prompt("Enter target path for move", row.path, function (newPath) {
    if (!newPath || newPath === row.path) return;
    makeUnique(rootRow, newPath, row.mode, function (path) {
      row.call(fs.prepEntry, newPath, function () {
        if (modes.isFile(row.mode)) activePath = path;
        var oldPath = row.path;
        row.call(rename, path);
        row.call(oldPath, fs.moveEntry, path);
      });
    });
  });
}

function copyEntry(row) {
  dialog.prompt("Enter target path for copy", row.path, function (newPath) {
    if (!newPath || newPath === row.path) return;
    makeUnique(rootRow, newPath, row.mode, function (path) {
      row.call(fs.prepEntry, newPath, function () {
        if (modes.isFile(row.mode)) activePath = path;
        row.call(copy, path);
        row.call(fs.copyEntry, path);
      });
    });
  });
}

function removeEntry(row) {
  dialog.confirm("Are you sure you want to delete " + row.path + "?", function (confirm) {
    if (!confirm) return;
    row.call(remove);
    row.call(fs.deleteEntry);
  });
}

function liveExport(row) {
  var index = row.path.indexOf("/");
  var root = index > 0 ? row.path.substring(0, index) : row.path;
  dialog.exportConfig({
    entry: prefs.get("defaultExportEntry"),
    source: row.path,
    filters: root + "/filters",
    name: row.path.substring(row.path.indexOf("/") + 1)
  }, function (settings) {
    if (!settings) return;
    prefs.set("defaultExportEntry", settings.entry);
    row.call(fs.addExportHook, settings);
  });
}


function createClone() {
  dialog.multiEntry("Clone Remote Repo", [
    {name: "url", placeholder: "git@hostname:path/to/repo.git", required : true},
    {name: "name", placeholder: "localname"}
  ], function (result) {
    if (!result) return;
    var name = result.name || result.url;
    makeUnique(rootRow, name, modes.commit, function (path) {
      rootRow.call(path, fs.addRepo, { url: result.url });
    });
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
    var url = result.path;
    // Assume github if user/name combo is given
    if (/^[^\/:@]+\/[^\/:@]+$/.test(url)) {
      url = "git@github.com:" + url + ".git";
    }
    var name = result.name || result.path;
    makeUnique(rootRow, name, modes.commit, function (path) {
      rootRow.call(path, fs.addRepo, { url: url, github: true });
    });
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
  row = row || rootRow;
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
      actions.push({icon:"folder", label:"Import Folder", action: importFolder});
      if (row.path) {
        actions.push({icon:"fork", label: "Add Submodule", action: addSubmodule});
      }
      else {
        actions.push(
          {icon:"fork", label: "Clone Remote Repo", action: createClone},
          {icon:"github", label: "Live Mount Github Repo", action: createGithubMount},
          {icon:"ccw", label: "Remove All", action: removeAll}
        );
      }
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
  if (row.path) {
    actions.push({sep:true});
    actions.push({icon:"pencil", label:"Move " + type, action: moveEntry});
    actions.push({icon:"docs", label:"Copy " + type, action: copyEntry});
    actions.push({icon:"trash", label:"Delete " + type, action: removeEntry});
  }
  actions.push({sep:true});
  actions.push({icon:"globe", label:"Serve Over HTTP"});
  actions.push({icon:"hdd", label:"Live Export to Disk", action: liveExport});
  if (actions[0].sep) actions.shift();

  return actions;
}

function remove(oldPath, callback) {
  var regExp = new RegExp("^" + rescape(oldPath) + "(?=$|/)");
  var paths = Object.keys(rows);
  for (var i = 0, l = paths.length; i < l; i++) {
    var path = paths[i];
    if (!regExp.test(path)) continue;
    delete rows[path];
    if (openPaths[path]) delete openPaths[path];
  }
  // TODO: fix this
  callback();
  // fs.removeRoots(regExp, callback);
  prefs.save();
}

function copy(oldPath, newPath, callback) {
  var regExp = new RegExp("^" + rescape(oldPath) + "(?=$|/)");
  var paths = Object.keys(rows);
  for (var i = 0, l = paths.length; i < l; i++) {
    var path = paths[i];
    if (!regExp.test(path)) continue;
    var replacedPath = path.replace(regExp, newPath);
    if (openPaths[path]) openPaths[replacedPath] = true;
  }
  // TODO: fix this
  callback();
  // fs.copyRoots(regExp, newPath, callback);
  prefs.save();
}

function rename(oldPath, newPath, callback) {
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
  // TODO: fix this
  callback();
  // fs.renameRoots(regExp, newPath, callback);
  prefs.save();
}

function trim(path, tree, callback) {
  // Trim rows that are not in the tree anymore.  I welcome a more effecient way
  // to do this than scan over the entire list looking for patterns.
  var regExp = new RegExp("^" + rescape(path) + "\/([^\/]+)(?=\/|$)");
  var paths = Object.keys(rows);
  var match;
  for (var i = 0, l = paths.length; i < l; i++) {
    var childPath = paths[i];
    match = childPath.match(regExp);
    if (match && !tree[match[1]]) {
      delete rows[childPath];
      if (openPaths[childPath]) delete openPaths[childPath];
    }
  }

  match = activePath && activePath.match(regExp);
  if (match && !tree[match[1]]) {
    activePath = null;
    prefs.set("activePath", activePath);
    setDoc();
  }

  // TODO: fix this
  callback();
  // fs.trimRoots(regExp, tree, callback);
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