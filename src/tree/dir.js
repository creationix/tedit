/*global define, chrome*/
define("tree/dir", function () {
  "use strict";

  var modes = require('modes');
  var fileSystem = chrome.fileSystem;
  var prefs = require('prefs');
  var domBuilder = require('dombuilder');
  var Node = require('tree/node');

  function Dir() {
    Node.apply(this, arguments);
    if (!this.ulEl) {
      this.el.appendChild(domBuilder(["ul$ulEl"], this));
      var openPaths = prefs.get("openPaths", {});
      if (openPaths[this.path]) this.onToggle();
    }
  }

  // Inherit from Node
  Dir.prototype = Object.create(Node.prototype, {
    constructor: { value: Dir }
  });

  Dir.prototype.getMenuItems = function () {
    var actions = [];
    if (!this.parent) {
      actions.push({icon: "trash", label: "Remove this repo", action: "removeSelf"});
    }
    actions.push({icon: "floppy", label: "Export tree to filesystem", action: "exportToFs"});
    if (this.children) {
      actions.push({icon: "folder-open", label: "Import tree from filesystem", action: "importTree"});
      actions.push({icon: "doc", label: "Import file(s) from filesystem", action: "importFiles"});
    }
    return actions;
  };

  Dir.prototype.removeSelf = function () {
    Node.removeRoot(this);
  };

  Dir.load = function (callback) {
  }

  Dir.prototype.addChild = function (name, mode, hash) {
    if (this.children) {
      var child = Node.create(this.repo, name, mode, hash, this);
      this.ulEl.appendChild(child.el);
      // TODO: sort children
    }

    // TODO: modify persistent data
  };

  Dir.prototype.importTree = function () {
    var self = this;
    fileSystem.chooseEntry({
      type: "openDirectory",
    }, onEntry);

    function onEntry(entry) {
      require('importfs')(self.repo, entry, onDone);
    }

    function onDone(err, hash, name) {
      if (err) throw err;
      self.addChild(name, modes.tree, hash);
    }
  };

  Dir.prototype.importFiles = function () {
    var self = this;
    fileSystem.chooseEntry({
      type: "openFile",
      acceptsMultiple : true
    }, onEntry);

    function onEntry(entries) {
      for (var i = 0, l = entries.length; i < l; i++) {
        require('importfs')(self.repo, entries[i], onDone);
      }
    }

    function onDone(err, hash, name) {
      if (err) throw err;
      self.addChild(name, modes.blob, hash);
    }
  };

  Dir.prototype.exportToFs = function () {
    var self = this;
    fileSystem.chooseEntry({
      type: "openDirectory",
    }, onEntry);

    function onEntry(entry) {
      require('exportfs')(entry, self.repo, self.name, self.mode, self.hash, onDone);
    }

    function onDone(err) {
      if (err) throw err;
      console.log("DONE");
    }
  };

  Dir.prototype.onToggle = function () {
    var self = this;
    var openPaths = prefs.get("openPaths", {});

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
