/*global define, ace, URL*/
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

  var imagetypes = {
    gif:  "image/gif",
    jpg:  "image/jpeg",
    jpeg: "image/jpeg",
    png:  "image/png",
    svg:  "image/svg+xml",
  };

  var openPaths = prefs.get("openPaths", {});
  var selectedPath = "";
  var activePath = "";
  // Active documents by path
  var docPaths = {};
  // repos by path
  var repos = {};

  var roots = [];


  $.tree.addEventListener("click", onClick, false);
  $.tree.addEventListener("contextmenu", onContextMenu, false);

  addRoot.refresh = refresh;
  return addRoot;

  function addRoot(repo, hash, name) {
    findRepos(repo, name);
    roots.push({repo:repo, hash:hash, name:name});
    refresh();
  }

  function refresh() {
    var left = 0;
    var items = [];
    roots.forEach(function (root) {
      left++;
      renderCommit(root.repo, root.hash, root.name, root.name, function (err, ui) {
        if (err) throw err;
        items.push(domBuilder(ui));
        if (--left) return;
        $.tree.textContent = "";
        $.tree.appendChild(domBuilder(items));
      });
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
      openPaths[path] ? "folder-open" : "folder";
    var classes = ["row"];
    if (selectedPath === path) classes.push("selected");
    if (activePath === path) classes.push("activated");
    return ["li",
      ["div", {"data-hash":hash, "data-path":path, "data-mode":mode.toString(8), "class": classes.join(" ")},
        ["i.icon-" + icon],
        ["span", name]
      ]
    ];
  }

  function renderTree(repo, hash, name, path, callback) {
    repo.loadAs("tree", hash, function (err, tree) {
      if (!tree) return callback(err || new Error("Missing tree " + hash));
      var open = openPaths[path];
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
    var mode = parseInt(node.mode, 8);
    var path = node.path;

    // Trees toggle on click
    if (mode === modes.tree) {
      if (openPaths[path]) delete openPaths[path];
      else openPaths[path] = true;
      prefs.set("openPaths", openPaths);
      return refresh();
    }

    activate(node);

  }

  function activate(node) {
    var path = node.path;
    if (activePath === path) {
      activePath = null;
      refresh();
      return loadDoc();
    }
    activePath = node.path;
    refresh();
    var doc = docPaths[path];
    if (doc) return loadDoc(doc);
    var repo = findRepo(path);
    if (!repo) throw new Error("Missing repo for " + path);
    var name = path.substr(path.lastIndexOf("/") + 1);
    return repo.loadAs("blob", node.hash, function (err, buffer) {
      if (err) throw err;
      var imageMime = imagetypes[path.substr(path.lastIndexOf(".") + 1)];
      if (imageMime) {
        doc = docPaths[path] = {
          tiled: false,
          name: name,
          url: URL.createObjectURL(new Blob([buffer], {type: imageMime}))
        };
        return loadDoc(doc);
      }

      var mode = modelist.getModeForPath(name);
      var code;

      try {
        code = binary.toUnicode(buffer);
      }
      catch (err) {
        // Data is not unicode!
        return;
      }
      doc = docPaths[path] = ace.createEditSession(code, mode.mode);
      doc.name = name;
      whitespace.detectIndentation(doc);
      loadDoc(doc);
    });


  }

  function loadDoc(doc, soft) {
    editor.setDoc(doc);
    if (!soft) editor.focus();
  }

  function findRepo(path) {
    var keys = Object.keys(repos);
    var longest = "";
    for (var i = 0, l = keys.length; i < l; i++) {
      var key = keys[i];
      if (key.length < longest) continue;
      if (path.substr(0, key.length) !== key) continue;
      longest = key;
    }
    if (longest) return repos[longest];
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