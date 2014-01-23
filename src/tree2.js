/*global define, ace*/
define("tree2", function () {
  var $ = require('elements');
  var modes = require('modes');
  var editor = require('editor');
  var domBuilder = require('dombuilder');
  var modelist = ace.require('ace/ext/modelist');
  var whitespace = ace.require('ace/ext/whitespace');
  var prefs = require('prefs');
  var binary = require('binary');
  require('zoom');
  var roots = [];
  var selected = null;
  var active = null;

  $.tree.addEventListener("click", onClick, false);
  $.tree.addEventListener("contextmenu", onContextMenu, false);

  return {
    addRoot: addRoot,
    removeRoot: removeRoot
  };

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
    evt.preventDefault();
    evt.stopPropagation();
    console.log("MENU", node);
  }

  function toggleTree(node) {
    var openPaths = prefs.get("openPaths", {});

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

    node.children = [];
    updateNode(node);
    Object.keys(node.tree).map(function (name) {
      var entry = node.tree[name];
      var path = node.path + "/" + name;
      console.log(name, entry);
      if (entry.mode !== modes.commit) return createNode(node.repo, path, onChild);
      var submodule = node.repo.submodules[path.substr(1)];
      if (!submodule) throw new Error("Invalid submodule " + path);
      createCommitNode(submodule, entry.hash, name, onChild);
    });

    function onChild(err, child) {
      if (err) throw err;
      if (!child) throw new Error("Broken child");
      node.children.push(child);
      child.parent = node;
      updateNode(child);
      node.ulEl.appendChild(child.el);
    }

  }

  function toggleNode(node) {
    var old = active;
    if (node === active) active = null;
    else active = node;
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

  function addRoot(repo, hash, name) {
    createCommitNode(repo, hash, name, function (err, commitNode) {
      if (err) throw err;
      if (!commitNode) throw new Error("Invalid commit hash: " + hash);
      roots.push(commitNode);
      updateNode(commitNode);
      $.tree.appendChild(commitNode.el);
    });
  }

  function createNode(repo, path, callback) {
    repo.pathToEntry(repo.root, path, onEntry);

    function onEntry(err, node) {
      if (!node) return callback(err);

      // Store the path within this repo for future reference
      node.path = path;

      node.name = path.substr(path.lastIndexOf("/") + 1);

      // Build the skeleton dom elements
      domBuilder(["li$el",
        [".row$rowEl", ["i$iconEl"], ["span$nameEl", name] ],
      ], node);

      // Create a back-reference for the event-delegation code to find
      node.rowEl.js = node;

      // Trees add a ul element
      if (modes.isTree(node.mode)) {
        node.el.appendChild(domBuilder(["ul$ulEl"], node));
      }

      callback(null, node);
    }
  }

  function createCommitNode(repo, hash, name, callback) {
    var commit;
    repo.loadAs("commit", hash, onCommit);

    function onCommit(err, result) {
      if (!result) return callback(err);
      commit = result;
      commit.hash = hash;
      // Store the hash to the root tree
      repo.root = commit.tree;
      // Create a tree node now
      createNode(repo, "", onTreeNode);
    }

    function onTreeNode(err, node) {
      if (!node) return callback(err);
      // Store the commit data on the tree
      node.commit = commit;

      // Insert an icon to show this is a commit.
      domBuilder(["i.icon-fork.tight$forkEl"], node);
      node.rowEl.insertBefore(node.forkEl, node.nameEl);

      // Store the custom name since the path is ""
      node.name = name;

      callback(null, node);
    }
  }

  function updateNode(node) {
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
    node.rowEl.setAttribute("class", classes.join(" "));
  }


  function removeRoot(root) {
    roots.splice(roots.indexOf(root), 1);
    $.tree.removeChild(root.el);
  }


});