/*global define, ace*/
define("tree2", function () {
  var $ = require('elements');
  var modes = require('modes');
  var editor = require('editor');
  var domBuilder = require('dombuilder');
  var modelist = ace.require('ace/ext/modelist');
  var whitespace = ace.require('ace/ext/whitespace');
  var contextMenu = require('context-menu');
  var prefs = require('prefs');
  var binary = require('binary');
  var dialog = require('dialog');
  require('zoom');
  var roots = [];
  var selected = null;
  var active = null;
  var activePath;
  var openPaths = prefs.get("openPaths", {});

  $.tree.addEventListener("click", onClick, false);
  $.tree.addEventListener("contextmenu", onContextMenu, false);

  return addRoot;

  function addRoot(repo, hash, name) {
    createCommitNode(repo, hash, name, null, function (err, node) {
      if (err) throw err;
      if (!node) throw new Error("Invalid commit hash: " + hash);
      roots[name] = node;
      updateNode(node);
      $.tree.appendChild(node.el);
    });
  }

  function removeRoot(root) {
    dialog.confirm("Are you sure you want to remove this entire repository?", function (confirm) {
      if (!confirm) return;
      delete roots[root.name];
      // TODO: purge paths related to this
      $.tree.removeChild(root.el);
    });
  }

  function renameRoot(root) {
    dialog.prompt("Enter name for new repository", root.name, function (name) {
      if (!name || name === root.name) return;
      throw "TODO: renameRoot";
    });
  }

  function removeNode(node) {
    dialog.confirm("Are you sure you want to remove this node?", function (confirm) {
      if (!confirm) return;
      notifyParent(node, node.name);
    });
  }

  function renameNode(node) {
    dialog.prompt("Enter new name.", node.name, function (newName) {
      if (!newName || newName === node.name) return;
      var oldName = node.name;
      node.name = newName;
      updateNode(node);
      notifyParent(node, oldName, newName);
    });
  }

  function createFile(parent) {
    dialog.prompt("Enter name for new file.", "", function (name) {
      if (!name) return;
      throw "TODO: createFile";
    });
  }

  function createFolder(parent) {
    dialog.prompt("Enter name for new folder.", "", function (name) {
      if (!name) return;
      throw "TODO: createFolder";
    });
  }

  function createSymLink(parent) {
    dialog.prompt("Enter name for new sym-link.", "", function (name) {
      if (!name) return;
      throw "TODO: createSymLink";
    });
  }

  function toggleExec(node) {
    node.mode = node.mode === modes.exec ? modes.blob : modes.exec;
    updateNode(node);
    notifyParent(node, node.name, node.name);
  }

  // This is a multi-function routine
  // If oldName is null, it's a new child
  // If newName is null, it's a child removal
  // If they are different it's a rename
  // If they are the same, the child changed in some other way.
  // This assumes the node has the correct hash and mode already.
  function notifyParent(node, oldName, newName) {
    var parent = node.parent;
    if (!parent) {
      console.log(node.commit.hash);
      return;
    }
    var repo = parent.repo;

    // Clone old tree so we can make local modifications
    var tree = {};
    Object.keys(parent.tree).forEach(function (name) {
      tree[name] = parent.tree[name];
    });

    if (oldName) {
      delete tree[oldName];
      removeChild(parent, node);
      if (node.commit) {
        delete parent.repo.submodules[oldName];
      }
    }
    if (newName) {
      if (node.commit) {
        tree[newName] = {
          mode: modes.commit,
          hash: node.commit.hash
        };
        parent.repo.submodules[newName] = node.repo;
      }
      else {
        tree[newName] = {
          mode: node.mode,
          hash: node.hash
        };
      }
      addChild(parent, node);
    }

    repo.saveAs("tree", tree, function (err, hash, newTree) {
      if (err) throw err;
      parent.tree = newTree;
      parent.hash = hash;
      if (!parent.commit) {
        return notifyParent(parent);
      }
      repo.root = hash;
      updateNode(parent);
      // Create a new temporary commit
      repo.saveAs("commit", {
        tree: hash,
        parent: repo.head,
        author: {name:"unknown", email: "unknown"},
        message: "Temporary Changes"
      }, function (err, hash, newCommit) {
        if (err) throw err;
        parent.commit = newCommit;
        newCommit.hash = hash;
        updateNode(parent);
        return notifyParent(parent);
      });
    });
  }

  function createCommitNode(repo, hash, name, parent, callback) {
    var commit;
    repo.loadAs("commit", hash, onCommit);

    function onCommit(err, result) {
      if (!result) return callback(err);
      commit = result;
      commit.hash = hash;
      // Store the hash to the root tree
      repo.root = commit.tree;
      repo.head = hash;
      // Create a tree node now
      createNode(repo, "", name, parent, onTreeNode);
    }

    function onTreeNode(err, node) {
      if (!node) return callback(err);
      // Store the commit data on the tree
      node.commit = commit;

      // Insert an icon to show this is a commit.
      domBuilder(["i.icon-fork.tight$forkEl"], node);
      node.rowEl.insertBefore(node.forkEl, node.nameEl);

      callback(null, node);
    }
  }

  function createNode(repo, path, name, parent, callback) {
    var fullPath = parent ? parent.fullPath + "/" + name : name;
    repo.pathToEntry(repo.root, path, onEntry);

    function onEntry(err, node) {
      if (!node) return callback(err);

      // Store the path within this repo for future reference
      node.path = path;
      node.name = name;
      node.fullPath = fullPath;
      node.parent = parent;

      // Build the skeleton dom elements
      domBuilder(["li$el",
        [".row$rowEl", ["i$iconEl"], ["span$nameEl", name] ],
      ], node);

      // Create a back-reference for the event-delegation code to find
      node.rowEl.js = node;

      // Trees add a ul element
      if (modes.isTree(node.mode)) {
        node.el.appendChild(domBuilder(["ul$ulEl"], node));
        if (openPaths[fullPath]) {
          toggleTree(node);
        }
      }

      callback(null, node);
    }
  }

  function removeChild(parent, child) {
    var children = parent.children;
    var index = children.indexOf(child);
    if (index < 0) return;
    children.splice(index, 1);
    parent.ulEl.removeChild(child.el);
  }

  // Add a child node in the correct sorted position
  function addChild(parent, child) {
    var children = parent.children;
    for (var i = 0, l = children.length; i < l; i++) {
      var other = children[i];
      if (other.name + "/" < child.name + "/") break;
    }
    if (i < l) {
      parent.ulEl.insertBefore(child.el, children[i].el);
      children.splice(i, 0, child);
    }
    else {
      parent.ulEl.appendChild(child.el);
      children.push(child);
    }
  }

  function updateNode(node) {
    node.nameEl.setAttribute("class", node.mode === modes.exec ? "executable" : "");
    node.nameEl.textContent = node.name;
    // Calculate the icon based on the node mode
    var icon = node.mode === modes.tree ?
      node.children ? "folder-open" : "folder" :
      modes.isFile(node.mode) ? "doc" :
      node.mode === modes.sym ? "link" : "asterisk";
    node.iconEl.setAttribute("class", "icon-" + icon);
    node.iconEl.setAttribute("title", modes.toType(node.mode) + " " + node.hash);
    if (node.commit) {
      node.forkEl.setAttribute("title", "commit " + node.commit.hash);
      node.nameEl.setAttribute("title", node.commit.message);
    }
    var classes = ["row"];
    if (selected === node)  classes.push("selected");
    if (active === node) classes.push("activated");
    if (node.commit && node.repo.head !== node.commit.hash) classes.push("staged");
    node.rowEl.setAttribute("class", classes.join(" "));
  }

  function findJs(node) {
    while (!node.js && node !== $.tree) node = node.parentElement;
    return node.js;
  }

  function onClick(evt) {
    var node = findJs(evt.target);
    if (!node) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (node.mode === modes.tree) return toggleTree(node);
    toggleNode(node);
  }

  function onContextMenu(evt) {
    var node = findJs(evt.target);
    var actions = [];
    if (node) {
      var type;
      actions.push({icon:"globe", label:"Serve Over HTTP"});
      actions.push({icon:"hdd", label:"Live Export to Disk"});
      if (node.commit) {
        if (node.repo.head !== node.commit.hash) {
          actions.push({sep:true});
          actions.push({icon:"floppy", label:"Commit Changes"});
          actions.push({icon:"ccw", label:"Revert all Changes"});
        }
        actions.push({sep:true});
        actions.push({icon:"download-cloud", label:"Pull from Remote"});
        actions.push({icon:"upload-cloud", label:"Push to Remote"});
      }
      if (node.mode === modes.tree) {
        type = node.commit ? "Submodule" : "Folder";
        actions.push({sep:true});
        actions.push({icon:"doc", label:"Create File", action: createFile});
        actions.push({icon:"folder", label:"Create Folder", action: createFolder});
        actions.push({icon:"link", label:"Create SymLink", action: createSymLink});
        actions.push({sep:true});
        actions.push({icon:"fork", label: "Import Remote Repo"});
        actions.push({icon:"folder", label:"Import Folder"});
        actions.push({icon:"docs", label:"Import File(s)"});
      }
      else if (modes.isFile(node.mode)) {
        type = "File";
        actions.push({sep:true});
        var label = (node.mode === modes.exec) ?
          "Make not Executable" :
          "Make Executable";
        actions.push({icon:"asterisk", label: label, action: toggleExec});
      }
      else if (node.mode === modes.sym) {
        type = "SymLink";
      }
      actions.push({sep:true});
      if (node.parent) {
        actions.push({icon:"pencil", label:"Rename " + type, action: renameNode});
        actions.push({icon:"trash", label:"Delete " + type, action: removeNode});
      }
      else {
        actions.push({icon:"pencil", label:"Rename Repo", action: renameRoot});
        actions.push({icon:"trash", label:"Remove Repo", action: removeRoot});
      }
    }
    else {
      actions.push({icon:"git", label: "Create Empty Git Repo"});
      actions.push({icon:"hdd", label:"Create Repo From Folder"});
      actions.push({icon:"fork", label: "Clone Remote Repo"});
      actions.push({icon:"github", label: "Live Mount Github Repo"});
    }
    if (!actions.length) return;
    evt.preventDefault();
    evt.stopPropagation();
    contextMenu(evt, node, actions);
  }

  function toggleTree(node) {

    // If it's open, remove all children.
    if (node.children) {
      node.children.forEach(function (child) {
        node.ulEl.removeChild(child.el);
      });
      node.children = null;
      delete openPaths[node.fullPath];
      prefs.set("openPaths", openPaths);
      updateNode(node);
      return;
    }

    openPaths[node.fullPath] = true;
    prefs.set("openPaths", openPaths);
    node.children = [];
    updateNode(node);

    Object.keys(node.tree).map(function (name) {
      var entry = node.tree[name];
      var path = node.path + "/" + name;
      var fullPath = node.fullPath + "/" + name;
      if (fullPath === activePath) {
        return onChild(null, active);
      }
      if (entry.mode !== modes.commit) return createNode(node.repo, path, name, node, onChild);
      var submodule = node.repo.submodules[path.substr(1)];
      if (!submodule) throw new Error("Invalid submodule " + path);
      createCommitNode(submodule, entry.hash, name, node, onChild);
    });

    function onChild(err, child) {
      if (err) throw err;
      if (!child) throw new Error("Broken child");
      updateNode(child);
      addChild(node, child);
    }
  }

  function toggleNode(node) {
    var old = active;
    if (node === active) {
      active = null;
      activePath = null;
    }
    else {
      active = node;
      activePath = node.fullPath;
    }
    if (old) updateNode(old);
    if (active) updateNode(active);
    activateNode(active);
  }

  function activateNode(node, soft) {
    if (!node || node.doc) return onDoc();

    node.repo.loadAs("blob", node.hash, function (err, buffer) {
      if (err) throw err;

      var mode = modelist.getModeForPath(node.name);
      var code;

      try {
        code = binary.toUnicode(buffer);
      }
      catch (err) {
        // Data is not unicode!
        return;
      }
      node.doc = ace.createEditSession(code, mode.mode);
      whitespace.detectIndentation(node.doc);
      return onDoc();
    });

    function onDoc() {
      editor.setNode(node);
      if (!soft) editor.focus();
    }
  }




});