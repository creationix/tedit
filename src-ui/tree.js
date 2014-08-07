var modes = require('js-git/lib/modes');
var defer = require('js-git/lib/defer');
var run = require('gen-run/run.js');

module.exports = Tree;

function Tree(emit, refresh) {
  var root = {};
  var repo, name;

  run(function* () {
    yield defer;
    var head = yield repo.readRef("refs/heads/master");
    if (!head) {
      console.log("No repo found, creating a new one");
      head = yield repo.saveAs("commit", {
        tree: yield repo.saveAs("tree", {}),
        author: {
          name: "AutoInit",
          email: "js-git@creationix.com"
        },
        message: "Auto-init empty repo"
      });
      yield repo.updateRef("refs/heads/master", head);
    }
    var commit = yield repo.loadAs("commit", head);
    root.mode = modes.tree;
    root.hash = commit.tree;
    refresh();
  });

  return {
    render: render,
    on: {
      click: onChildClick
    }
  };

  function render(newRepo, newName) {
    repo = newRepo;
    name = newName;
    return [
      ["form", {onsubmit: onSubmit},
        ["input", {name: "path", placeholder: "path", required: true}],
        ["input", {type: "submit", "value": "Create File"}],
      ],
      ["ul.tree",
        [Row, name, root]
      ]
    ];
  }

  function onSubmit(evt) {
    /*jshint validthis:true*/
    evt.preventDefault();
    var entries = [{ mode: modes.blob, content: "", path: this.path.value }];
    entries.base = root.hash;
    run(function* () {
      root.hash = yield repo.createTree(entries);
      yield repo.updateRef("refs/heads/master", yield repo.saveAs("commit", {
        tree: root.hash,
        author: {
          name: "JS-Git",
          email: "js-git@creationix.com"
        },
        message: "Auto commit"
      }));
      yield* cleanup(root);
    });
  }

  function onChildClick(path, node) {
    run(function* () {
      node.treeHash = node.hash;
      node.tree = yield repo.loadAs("tree", node.hash);
      node.busy = false;
      node.open = true;
      refresh();
    });
  }

  function* cleanup(node) {
    if (node.mode !== modes.tree) return;
    if (node.hash !== node.treeHash) {
      node.treeHash = node.hash;
      node.tree = yield repo.loadAs("tree", node.hash);
      refresh();
      var names = Object.keys(node.tree);
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var child = node.tree[name];
        if (child.mode === modes.tree) {
          yield* cleanup(child);
        }
      }
    }
  }
}

function Row(emit, refresh) {
  var path, node;

  return {render: render};

  function render(newPath, newNode) {
    path = newPath;
    node = newNode;
    var icon =
      node.busy ? "icon-spin1 animate-spin" :
      node.mode === modes.sym ? "icon-link" :
      node.mode === modes.file ? "icon-doc" :
      node.mode === modes.exec ? "icon-cog" :
      node.mode === modes.commit ? "icon-fork" :
      node.open ? "icon-folder-open" : "icon-folder";
    var title = modes.toType(node.mode) + " " + node.hash;
    var name = path.substring(path.lastIndexOf("/") + 1);
    var ui = ["li",
      ["div.row", {onclick: onClick},
        ["i", {class: icon, title: title}],
        ["span", {title:path}, name],
      ]
    ];
    if (node.open) {
      var ul = ["ul"];
      ui.push(ul);
      var names = Object.keys(node.tree);
      for (var i = 0; i < names.length; i++) {
        var childName = names[i];
        ul.push([Row, join(path, childName), node.tree[childName]]);
      }
    }
    return ui;
  }

  function onClick(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    if (node.mode !== modes.tree) return;
    if (node.tree) {
      node.open = !node.open;
      refresh();
    }
    else {
      node.busy = true;
      refresh();
      emit("click", path, node);
    }
  }
}

function join(base, name) {
  return base ? base + "/" + name : name;
}
