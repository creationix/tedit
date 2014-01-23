/*global define*/
define("tree2/tree", function () {
  "use strict";
  var Node = require("tree2/node");
  var Blob = require("tree2/blob");
  var SymLink = require("tree2/symlink");
  var domBuilder = require('dombuilder');
  var modes = require('modes');

  var constructors = {};
  constructors[modes.tree] = Tree;
  constructors[modes.blob] = require("tree2/blob");
  constructors[modes.exec] = require("tree2/exblob");
  constructors[modes.exec] = require("tree2/exblob");


  function Tree() {
    Node.apply(this, arguments);
    this.el.appendChild(domBuilder(["ul$ulEl"], this));
    this.children = null;
    var self = this;
  }

  Node.adopt(Tree);

  Tree.prototype.mode = modes.tree;

  Tree.prototype.onClick = function () {
    var self = this;
    console.log("onClick", this.children)
    // var openPaths = prefs.get("openPaths", {});

    // If the folder is open, remove the children.
    if (this.children) {
      this.children.forEach(function (child) {
        self.ulEl.removeChild(child.el);
      });
      this.children = null;
      // delete openPaths[self.path];
      // prefs.set("openPaths", openPaths);
      this.onChange();
    }
    else {
      this.children = Object.keys(this.tree).map(function (name) {
        var entry = this.tree[name];
        if (entry.mode === modes.tree) Constructor = Tree;
        if (modes.isBlob(entry.mode)) Constructor = Blob;
        if (modes.isTree(entry.mode)) Constructor = Tree;

        var child = Node.create(this.repo, this.path + "/" + name, name, this);
        this.ulEl.appendChild(child.el);
        return child;
      }, this);
    }

    // function onTree(err, tree) {
    //   if (err) throw err;
    //   self.children = Object.keys(tree).map(function (name) {
    //     var entry = tree[name];
    //     var child = Node.create(self.repo, name, entry.mode, entry.hash, self);
    //     self.ulEl.appendChild(child.el);
    //     return child;
    //   });
    //   // openPaths[self.path] = true;
    //   // prefs.set("openPaths", openPaths);
    //   self.onChange();
    // }
  };

  return Tree;
});