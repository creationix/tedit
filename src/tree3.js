/*global define, ace*/
define("tree3", function () {
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

  var openedPaths = prefs.get("openPaths", {});
  var selectedPath = "";
  var activePath = "";
  // repos by path
  var repos = {};


  $.tree.addEventListener("click", onClick, false);
  $.tree.addEventListener("contextmenu", onContextMenu, false);

  return addRoot;

  function addRoot(repo, hash, name) {
    findRepos(repo, name);
    console.log(repos);
    renderCommit(repo, hash, name, name, function (err, ui) {
      if (err) throw err;
      $.tree.appendChild(domBuilder(ui));
    });
  }

  function findRepos(repo, path) {
    repos[path] = repo;
    var submodules = repo.submodules;
    if (!submodules) return;
    Object.keys(submodules).forEach(function (subPath) {
      findRepos(submodules[subPath], path + "/" + subPath);
    });
  }

  function renderCommit(repo, hash, name, path, callback) {
    repo.loadAs("commit", hash, function (err, commit) {
      if (!commit) return callback(err || new Error("Missing commit " + hash));
      renderTree(repo, commit.tree, name, path, function (err, ui) {
        if (err) return callback(err);
        ui[1][1]["data-commit-hash"] = hash;
        ui[1].splice(3, 0, ["i.icon-fork.tight"]);
        callback(null, ui);
      });
    });
  }

  function renderNode(hash, mode, name, path) {
    var icon = modes.isFile(mode) ? "doc" :
      mode === modes.sym ? "link" :
      openedPaths[path] ? "folder-open" : "folder";
    return ["li",
      [".row", {"data-hash":hash, "data-path":path, "data-mode":mode.toString(8)},
        ["i.icon-" + icon],
        ["span", name]
      ]
    ];
  }

  function renderTree(repo, hash, name, path, callback) {
    repo.loadAs("tree", hash, function (err, tree) {
      if (!tree) return callback(err || new Error("Missing tree " + hash));
      var open = openedPaths[path];
      var ui = renderNode(hash, modes.tree, name, path);
      var names = Object.keys(tree);
      if (!open || !names.length) return callback(null, ui);
      var left = names.length;
      var children = new Array(left);
      Object.keys(tree).forEach(function (name, i) {
        var childPath = path ? path + "/" + name : name;
        var entry = tree[name];
        if (modes.isBlob(entry.mode)) {
          return onChild(null, renderNode(entry.hash, entry.mode, name, childPath));
        }
        if (entry.mode === modes.tree) {
          return renderTree(repo, entry.hash, name, childPath, onChild);
        }
        if (entry.mode === modes.commit) {
          var submodule = repos[childPath];
          if (!submodule) throw new Error("Missing submodule " + childPath);
          return renderCommit(submodule, entry.hash, name, childPath, onChild);
        }
        function onChild(err, childUi) {
          if (err) throw err;
          childUi[1][1]["data-parent"] = hash;
          children[i] = childUi;
          if (--left) return;
          ui.push(["ul", children]);
          callback(null, ui);

        }

      });
    });
  }


  function findJs(node) {
    while (node !== $.tree) {
      var hash = node.getAttribute("data-hash");
      if (hash) return node.dataset;
      node = node.parentElement;
    }
  }

  function onClick(evt) {
    var node = findJs(evt.target);
    if (!node) return;
    evt.preventDefault();
    evt.stopPropagation();
    console.log("click", node);
  }

  function onContextMenu(evt) {
    var node = findJs(evt.target);
    evt.preventDefault();
    evt.stopPropagation();
    var actions = [];
    console.log("context", node);
    if (!actions.length) return;
    evt.preventDefault();
    evt.stopPropagation();
    contextMenu(evt, node, actions);
  }

});