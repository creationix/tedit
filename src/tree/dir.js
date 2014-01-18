/*global define*/
define("tree/dir", function () {
  "use strict";

  var prefs = require('prefs');
  var domBuilder = require('dombuilder');
  var Node = require('tree/node');
  var openPaths = prefs.get("openPaths", {});

  function Dir() {
    Node.apply(this, arguments);
    this.el.appendChild(domBuilder(["ul$ulEl"], this));
    if (openPaths[this.path]) this.onClick();
  }

  // Inherit from Node
  Dir.prototype = Object.create(Node.prototype, {
    constructor: { value: Dir }
  });

  Dir.prototype.onClick = function () {
    var self = this;

    // If the folder is open, remove the children.
    if (this.children) {
      this.children.forEach(function (child) {
        self.ulEl.removeChild(child.el);
      });
      this.children = null;
      delete openPaths[self.path];
      prefs.set("openPaths", openPaths);
      this.onChange();
    }
    else {
      this.repo.loadAs("tree", this.hash, onTree);
    }

    function onTree(err, tree) {
      if (err) throw err;
      self.children = Object.keys(tree).map(function (name) {
        var entry = tree[name];
        var child = Node.create(self.repo, name, entry.mode, entry.hash, self);
        self.ulEl.appendChild(child.el);
        return child;
      });
      openPaths[self.path] = true;
      prefs.set("openPaths", openPaths);
      self.onChange();
    }
  };

  return Dir;
});
