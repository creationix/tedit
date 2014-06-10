define("ui/tree.js", ["ui/elements.js","data/fs.js","ui/row.js","js-git/lib/modes.js","js-git/lib/defer.js","prefs.js","data/document.js","ui/dialog.js","ui/context-menu.js","data/rescape.js","ui/editor.js","ui/slider.js","ui/notify.js","js-git/lib/find-common.js","runtimes.js","backends.js","ui/global-keys.js","data/hooks.js"], function (module, exports) { "use strict";
var rootEl = require('ui/elements.js').tree;
var fs = require('data/fs.js');

var makeRow = require('ui/row.js');
var modes = require('js-git/lib/modes.js');
var defer = require('js-git/lib/defer.js');
var prefs = require('prefs.js');
var setDoc = require('data/document.js');
var dialog = require('ui/dialog.js');
var contextMenu = require('ui/context-menu.js');
var rescape = require('data/rescape.js');
var editor = require('ui/editor.js');
var slider = require('ui/slider.js');
var notify = require('ui/notify.js');
var findCommon = require('js-git/lib/find-common.js');

var runtimes = require('runtimes.js');
var backends = require('backends.js');

var globalKeys = require('ui/global-keys.js');

setDoc.updateDoc = updateDoc;
setDoc.setActive = setActive;

// Memory for opened trees.  Accessed by path
var openPaths = prefs.get("openPaths", {});

// Rows indexed by path
var rows = {};
var rootRow;

// Hooks by path
var hookConfigs = prefs.get("hookConfigs", {});
var hooks = require('data/hooks.js');

var active;
// Remember the path to the active document.
var activePath = prefs.get("activePath", "");

fs.init(onChange, function (err, hash) {
  if (err) throw err;
  openPaths[""] = true;
  rootRow = renderChild("", modes.commit, hash);
  rootEl.appendChild(rootRow.el);
});

setTimeout(function () {
  runtimes.forEach(function (runtime) {
    var menuItem = runtime.menuItem;
    if (!menuItem || menuItem.keyCode === undefined) return;
    globalKeys.register(menuItem.combo, menuItem.keyCode, function () {
      if (!active) return;
      menuItem.action(active);
    });
  });
});

exports.reload = function () {
  onChange(fs.configs[""].current);
};

function onChange(hash) {
  renderChild("", modes.commit, hash);
  // Run any hooks
  Object.keys(hooks).forEach(function (root) {
    hooks[root](hash);
  });
}

rootEl.addEventListener("click", onGlobalClick, false);
rootEl.addEventListener("contextmenu", onGlobalContextMenu, false);
rootEl.addEventListener("dragover", enableDrop, false);
rootEl.addEventListener("dragenter", enableDrop, false);
rootEl.addEventListener("drop", onGlobalDrop, false);
function enableDrop(evt) {
  var row = findRow(evt.target) || rows[""];
  if (!row) return;
  evt.preventDefault();
  return false;
}

function onGlobalDrop(evt) {
  var row = findRow(evt.target) || rows[""];
  if (!row) return;
  while (row.mode !== modes.tree && row.mode !== modes.commit) {
    row = rows[dirname(row.path)];
  }

  if (!row) return;
  evt.preventDefault();
  var files = evt.dataTransfer.files;
  if (!files || !files.length) return;
  [].slice.call(files).forEach(function (file) {
    notify("Reading " + file.name + "...");
    var reader = new FileReader();
    reader.onloadend = function() {
      notify("Storing " + file.name + "...");
      var body = new Uint8Array(this.result);
      row.call(fs.saveAs, "blob", body, function (hash) {
        notify("Adding " + file.name);
        addChild(row, file.name, modes.file, hash);
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

function renderChild(path, mode, hash) {
  var row = rows[path];
  if (row) {
    row.mode = mode;
    row.errorMessage = "";
    // Skip nodes that haven't changed
    if (row.hash === hash) {
      return row;
    }
    row.hash = hash;
  }
  else {
    row = rows[path] = makeRow(path, mode, hash);
  }

  // Defer further loading so the row can render before it hits any problems.
  defer(function () {
    if (mode === modes.commit) row.call(fs.readCommit, onCommit);
    else init();
  });

  return row;

  function onCommit(entry) {
    if (!entry) throw new Error("Missing commit");
    var commit = entry.commit;
    var head = entry.head || {};
    row.hash = entry.hash;
    row.treeHash = commit.tree;
    var config = fs.configs[row.path];
    row.ahead = config.ahead || 0;
    row.behind = config.behind || 0;
    row.staged = commit.tree !== head.tree;
    row.title = formatDate(commit.author.date) + "\n" + commit.author.name + " <" + commit.author.email + ">\n\n" + commit.message.trim();
    init();
  }

  function formatDate(date) {
    var d = new Date(date.seconds * 1000);
    // TODO: find a way to show the original time zone?
    return d.toString();
  }

  function init() {
    if ((mode === modes.tree || mode === modes.commit) && openPaths[path]) openTree(row);
    if (activePath && activePath === path) activateDoc(row, !selected);
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
    row.addChild(renderChild(childPath, entry.mode, entry.hash));
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
  var paths = updatePaths();
  var wasSelected = !!selected;
  if (wasSelected) {
    select(paths, paths.indexOf(row.path));
  }
  activateRow(row, true);
  if (row.mode === modes.tree || row.mode === modes.commit) {
    if (!wasSelected) editor.focus();
  }
}

function activateRow(row, hard) {
  if (row.mode === modes.tree || row.mode === modes.commit) {
    if (openPaths[row.path]) closeTree(row);
    else openTree(row);
  }
  else if (modes.isFile(row.mode)) {
    activateDoc(row, hard);
  }
  else if (row.mode === modes.sym) {
    editSymLink(row);
  }
  else {
    row.fail(new Error("Unknown node mode"));
  }
}

function onGlobalContextMenu(evt) {
  var row = findRow(evt.target) || rows[""];
  if (!row) return;
  nullify(evt);
  var menu = makeMenu(row);
  contextMenu(evt, row, menu);
}

function openTree(row) {
  var path = row.path;
  row.open = true;
  row.call(fs.readTree, function (entry) {
    if (!entry.tree) throw new Error("Missing tree");
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
  if (active) {
    active.active = true;
    showRow(active.path);
  }
}

function showRow(path) {
  var index, parent;
  while ((index = path.indexOf("/", index + 1)) > 0) {
    var parentPath = path.substring(0, index);
    parent = rows[parentPath];
    if (!parent) break;
    if (!parent.open) openTree(parent);
  }
  var row = rows[path];
  if (row) scrollToRow(row);
}


exports.activateDoc = activateDoc;
function activateDoc(row, hard, callback) {
  var path = row.path;
  setActive(path);
  if (!active) return setDoc();
  row.call(fs.readBlob, function (entry) {
    setDoc(row, entry.blob);
    if (hard) editor.focus();
    if (callback) callback();
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
    // var config = fs.configs[row.path];
    // var githubName = fs.isGithub(row.path);
    // if (githubName && !config.passphrase) {
    //   var previewDiff = "https://github.com/" + githubName + "/commit/" + entry.hash;
    //   window.open(previewDiff);
    // }
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
        row.ahead++;
        var config = fs.configs[row.path];
        config.ahead = row.ahead;
        prefs.save();
        row.call(fs.setHead, hash);
      });
    });
  });
}

function revertChanges(row) {
  dialog.confirm("Are you sure you want to lose all uncommitted changes?", function (confirm) {
    if (!confirm) return;
    setDoc();
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

exports.makeUnique = makeUnique;
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
    openPaths[row.path] = true;
    row.call(path, fs.writeEntry, {
      mode: mode,
      hash: hash
    });
  });
}

exports.newFile = function () {
  var row = selected || active || rows[""];
  if (!row) return;
  while (row.mode !== modes.tree && row.mode !== modes.commit) {
    row = rows[dirname(row.path)];
  }
  createFile(row);
};

function dirname(path) {
  if (!path) throw new Error("No parent for root");
  var index = path.lastIndexOf("/");
  return index < 0 ? "" : path.substring(0, index);
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

function toggleExec(row) {
  var newMode = row.mode === modes.exec ? modes.file : modes.exec;
  row.call(fs.readEntry, function (entry) {
    row.call(fs.writeEntry, {
      mode: row.mode = newMode,
      hash: entry.hash
    });
  });
}

function forcePush(row) {
  sync(row, 2);
}
function discardCommits(row) {
  sync(row, 1);
}

function doSync(row, repo, config, callback) {
  if (!repo) row.fail("Not a commit node");
  if (config.head !== config.current) {
    notify("Please commit or revert changes before syncing");
    row.fail(new Error("Uncommited changes, can't sync."));
  }
  var localHead, remoteHead;
  row.call(config.ref, repo.send, function (result) {
    localHead = result;
    if (remoteHead) {
      row.call(repo, findCommon, localHead, remoteHead, onResult);
    }
  });
  row.call(config.ref, repo.fetch, Infinity, function (result) {
    remoteHead = result;
    if (localHead) {
      row.call(repo, findCommon, localHead, remoteHead, onResult);
    }
  });
  function onResult(ahead, behind) {
    row.ahead = ahead;
    row.behind = behind;
    config.ahead = ahead;
    config.behind = behind;
    prefs.save();
    callback(ahead, behind, localHead, remoteHead);
  }
}

// force = 1 discard local commits
// force = 2 discard remote commits
function sync(row, force) {
  var repo = fs.findRepo(row.path);
  var config = fs.configs[row.path];
  doSync(row, repo, config, onSync);

  function onSync(ahead, behind, localHead, remoteHead) {

    if (!ahead) {
      if (!behind) {
        return notify("No changes to sync");
      }
      return dialog.confirm("You are " + plural(behind, "commit") + " behind remote.  Pull changes?", function (confirm) {
        if (!confirm) return;
        fastForwardLocal();
      });
    }
    if (!behind) {
      return dialog.confirm("You are " + plural(ahead, "commit") + " ahead of remote.  Push changes?", function (confirm) {
        if (!confirm) return;
        fastForwardRemote();
      });
    }
    notify("Local and remote have diverged!\n" +
      "You are " + plural(ahead, "commit") + " ahead " +
      "and " + plural(behind, "commit") + " behind remote."
    );
    var message;
    if (force === 1) {
      message = "Are you sure you wish to discard " + plural(ahead, "commit") + "?";
      dialog.confirm(message, function (confirm) {
        if (!confirm) return;
        fastForwardLocal();
      });
    }
    if (force === 2) {
      message = "Are you sure you wish to force push over " + plural(behind, "commit") + "?";
      return dialog.confirm(message, function (confirm) {
        if (!confirm) return;
        fastForwardRemote(true);
      });
    }

    function fastForwardRemote(forcePush) {
      notify("Updating remote head on " + config.ref);
      row.busy++;
      repo.updateRemoteRef(config.ref, localHead, function (err) {
        row.busy--;
        if (err) row.fail(err);
        reset();
      }, forcePush);
    }

    function fastForwardLocal() {
      notify("Fast forwarding local head on " + config.ref);
      row.call(fs.setHead, remoteHead, reset);
    }
  }

  function reset() {
    row.ahead = 0;
    row.behind = 0;
    config.ahead = 0;
    config.behind = 0;
    prefs.save();
  }
}

function plural(num, word) {
  return num + " " + word + (num === 1 ? "" : "s");
}

function moveEntry(row) {
  dialog.prompt("Enter target path for move", row.path, function (newPath) {
    if (!newPath || newPath === row.path) return;
    makeUnique(rootRow, newPath, row.mode, function (path) {
      row.call(fs.prepEntry, newPath, function () {
        if (modes.isFile(row.mode)) activePath = path;
        var oldPath = row.path;
        row.call(oldPath, fs.moveEntry, path);
        row.call(rename, path);
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


function removeAll() {
  dialog.confirm("Are you sure you want to remove all repos?", function (confirm) {
    if (!confirm) return;
    var key;
    for (key in fs.configs) delete fs.configs[key];
    for (key in fs.repos) delete fs.repos[key];
    for (key in hookConfigs) delete hookConfigs[key];
    for (key in hooks) delete hooks[key];
    prefs.set("rootHash");
    prefs.save();
    if (window.chrome && window.chrome.runtime && window.chrome.runtime.reload) {
      window.chrome.runtime.reload();
    }
    else {
      window.location.reload();
    }
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
      actions.push(
        {icon:"doc", label:"Create File", action: createFile},
        {icon:"folder", label:"Create Folder", action: createFolder},
        {icon:"link", label:"Create SymLink", action: createSymLink}
      );
      if (backends.length) {
        actions.push({sep:true});
        backends.forEach(function (backend) {
          if (backend.menuItem) actions.push(backend.menuItem);
        });
      }
      if (!row.path) {
        actions.push({icon:"ccw", label: "Remove All Repos", action: removeAll});
      }
    }
  }
  if (row.mode === modes.commit) {
    if (fs.isDirty(row.path)) actions.push(
      {sep:true},
      {icon:"floppy", label:"Commit Changes", action: commitChanges},
      {icon:"ccw", label:"Revert all Changes", action: revertChanges}
    );
    var config = fs.configs[row.path];
    var repo = fs.findRepo(row.path);
    if (repo.fetch && config.current === config.head) {
      actions.push(
        {sep:true},
        {icon:"cw", label:"Sync with Remote", action: sync }
      );
      if (config.ahead && config.behind) {
        actions.push(
          {icon:"upload-cloud", label:"Force push", action: forcePush },
          {icon:"trash", label:"Discard Local Commits", action: discardCommits }
        );
      }
    }
  }
  else if (modes.isFile(row.mode)) {
    var label = (row.mode === modes.exec) ?
      "Make not Executable" :
      "Make Executable";
    actions.push(
      {sep:true},
      {icon:"asterisk", label: label, action: toggleExec}
    );
  }
  if (row.path) actions.push(
    {sep:true},
    {icon:"pencil", label:"Move " + type, action: moveEntry},
    {icon:"docs", label:"Copy " + type, action: copyEntry},
    {icon:"trash", label:"Delete " + type, action: removeEntry}
  );
  if (runtimes.length) {
    actions.push({sep:true});
    runtimes.forEach(function (runtime) {
      if (runtime.menuItem) actions.push(runtime.menuItem);
    });
  }

  // If there was a leading separator, remove it.
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
    if (hookConfigs[path]) delete hookConfigs[path];
    if (hooks[path]) delete hooks[path];
  }
  callback();
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
  callback();
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
    if (hookConfigs[path]) delete hookConfigs[path];
    if (hooks[path]) delete hooks[path];
  }
  callback();
  prefs.save();
}

function trim(path, tree, callback) {
  // Trim rows that are not in the tree anymore.  I welcome a more effecient way
  // to do this than scan over the entire list looking for patterns.
  var regExp = new RegExp("^" + rescape(path) + "\/([^\/]+)(?=\/|$)");
  var match;
  var paths = Object.keys(rows);
  for (var i = 0, l = paths.length; i < l; i++) {
    var childPath = paths[i];
    match = childPath.match(regExp);
    if (match && !tree[match[1]]) {
      delete rows[childPath];
      if (openPaths[childPath]) delete openPaths[childPath];
      if (hookConfigs[path]) delete hookConfigs[path];
      if (hooks[path]) delete hooks[path];
    }
  }

  match = activePath && activePath.match(regExp);
  if (match && !tree[match[1]]) {
    activePath = null;
    prefs.set("activePath", activePath);
    setDoc();
  }

  callback();
}

// Make a path unique
function uniquePath(name, obj) {
  var index = name.lastIndexOf(".");
  var base, ext;
  if (index >= 0) {
    base = name.substring(0, index);
    ext = name.substring(index);
  }
  var i = 1;
  while (name in obj) {
    name = base + "-" + (++i) + ext;
  }
  return name;
}

function splitPath(path) {
  return path.split("/").map(function (part) {
    return part.replace(/[\t\r\n\/]*/g, "").trim();
  }).filter(Boolean);
}

var selected = null;
var selectedPath = null;
var hideMode = false;
var memory = 200;

exports.toggle = function () {
  if (editor.focused) {
    editor.blur();
    if (dialog.close) return;
    selectedPath = active ? active.path : "";
    var paths = updatePaths();
    select(paths, paths.indexOf(selectedPath));
    hideMode = slider.size < 100;
    if (hideMode) {
      slider.size = memory || 200;
    }
  }
  else {
    editor.focus();
  }
};

exports.isFocused = function () {
  return !!selected;
};

editor.on("focus", function () {
  cancelFilter();
  if (selected) {
    selected.selected = false;
    selected = null;
    selectedPath = null;
    if (hideMode) {
      memory = slider.size;
      slider.size = 0;
    }
  }
  rootEl.classList.add("blur");
});

function select(paths, index) {
  if (selected) selected.selected = false;
  if (index < 0) index = 0;
  if (index > paths.length - 1) index = paths.length - 1;
  selectedPath = paths[index];
  selected = rows[selectedPath];
  if (selected) {
    rootEl.classList.remove("blur");
    selected.selected = true;
    scrollToRow(selected);
  }
}

function scrollToRow(row) {
  var max = row.el.offsetTop;
  var min = max + row.rowEl.offsetHeight - rootEl.offsetHeight + 16;
  var top = rootEl.scrollTop;
  if (top < min) rootEl.scrollTop = min;
  else if (top > max) rootEl.scrollTop = max;
}

exports.pageUp = function () {
  var paths = updatePaths();
  select(paths, paths.indexOf(selectedPath) - 10);
};

exports.pageDown = function () {
  var paths = updatePaths();
  select(paths, paths.indexOf(selectedPath) + 10);
};

exports.end = function () {
  var paths = updatePaths();
  select(paths, paths.length - 1);
};

exports.home = function () {
  var paths = updatePaths();
  select(paths, 0);
};

exports.left = function () {
  if (selected.open) closeTree(selected);
  else {
    var paths = updatePaths();
    var parentPath = selectedPath.substring(0, selectedPath.lastIndexOf("/"));
    select(paths, paths.indexOf(parentPath));
  }
};

exports.up = function () {
  var paths = updatePaths();
  select(paths, paths.indexOf(selectedPath) - 1);
};

exports.right = function () {
  if (modes.isFile(selected.mode)) return activateRow(selected);
  if (selected.mode !== modes.tree && selected.mode !== modes.commit) return;
  if (!selected.open) {
    cancelFilter();
    return openTree(selected);
  }
  if(selected.hasChildren) {
    var paths = updatePaths();
    select(paths, paths.indexOf(selectedPath) + 1);
  }
};

exports.down = function () {
  var paths = updatePaths();
  select(paths, paths.indexOf(selectedPath) + 1);
};

exports.activate = function () {
  activateRow(selected, true);
};

exports.preview = function () {
  activateRow(selected, false);
};


var filter = "";
var filterX;
exports.onChar = function (charCode) {
  filter += String.fromCharCode(charCode);
  updateFilter();
};

exports.backspace = function () {
  filter = filter.substring(0, filter.length - 1);
  updateFilter();
};

exports.cancel = function () {
  if (filter) cancelFilter();
  else editor.focus();
};

function cancelFilter() {
  if (!filter) return;
  filter = "";
  updateFilter();
}

function updatePaths() {
  if (selectedPath === null) selectedPath = active ? active.path : "";
  var skip = null;
  return Object.keys(rows).sort().filter(function (path) {
    var row = rows[path];
    var show, display = "block";
    if (filterX) {
      show = !filterX || filterX.test(path.substring(path.lastIndexOf("/") + 1));
      if (!show) display = "none";
    }
    else if (skip && skip.test(path) || (skip = false)) {
      show = false;
    }
    // Closed folders skip all children
    else {
      if ((row.mode === modes.tree || row.mode === modes.commit) && !row.open) {
        skip = new RegExp('^' + rescape(path) + (path ? "/" : ""));
      }
      show = true;
    }
    row.rowEl.style.display = display;
    return show;
  });
}

function updateFilter() {
  var valid = true;
  try { filterX = filter && new RegExp(filter, "i"); }
  catch (err) { valid = false; }
  if (filter) notify((valid ? "Filter" : "Invalid") + ": " + filter);
  else notify("Filter cleared");
  var paths = updatePaths();
  if (paths.indexOf(selectedPath) < 0 && paths.length) select(paths, 0);
}

editor.focus();
});
