/*global define*/
define("tree2/node", function () {
  "use strict";

  var domBuilder = require('dombuilder');
  var modes = require('modes');
  var getMime = require('mime')();

  function Node(repo, path, name, parent) {
    this.repo = repo;
    this.path = path;
    this.name = name;
    this.parent = parent || null;

    domBuilder(["li$el",
      ["$rowEl", { onclick: clickHandler(this) },
        ["i$iconEl"], ["span$nameEl"]
      ]
    ], this);
    this.rowEl.js = this;
    var self = this;

    repo.pathToEntry(repo.root, this.path, function (err, entry) {
      if (err) throw err;
      self.hash = entry.hash;
      if (entry.tree) self.tree = entry.tree;
      if (entry.link) self.link = entry.link;
      if (entry.commit) self.commit = entry.commit;
      self.onChange();
    });
  }

  Node.adopt = function (Child) {
    Child.__proto__ = this;
    Child.prototype.__proto__ = this.prototype;
  };

  Node.prototype.onChange = function () {
    var title = this.path;
    var classes = ["row"];
    if (Node.selected === this) {
      classes.push("selected");
    }
    if (Node.activated === this) {
      classes.push("activated");
    }

    this.rowEl.setAttribute("class", classes.join(" "));
    classes.length = 0;

    this.nameEl.textContent = this.name;
    this.nameEl.setAttribute('title', title);

    // Calculate the proper icon for the item.
    if (modes.isTree(this.mode) || modes.isCommit(this.mode)) {
      // Tree nodes with children are open
      if (this.children) classes.push("icon-folder-open");
      // Others are closed.
      else classes.push("icon-folder");
    }
    else if (modes.isFile(this.mode)) {
      var mime = getMime(this.name);
      if (/(?:\/json$|^text\/)/.test(mime)) {
        classes.push("icon-doc-text");
      }
      else if (/^image\//.test(mime)) {
        classes.push("icon-picture");
      }
      else if (/^video\//.test(mime)) {
        classes.push("icon-video");
      }
      else {
        classes.push("icon-doc");
      }
    }
    else if (modes.isSymLink(this.mode)) {
      classes.push("icon-link");
      this.nameEl.appendChild(domBuilder(["span.target", this.target]));
    }
    else throw new Error("Invalid mode 0" + this.mode.toString(8));
    this.iconEl.setAttribute("class", classes.join(" "));
    this.iconEl.setAttribute("title", this.hash);

  };

  Node.prototype.load = function (callback) {
    var self = this;
    this.repo.loadAs(this.type, function (err, body) {
      if (err) return callback(err);
      self.body = body;
      callback.call(self);
    });
  };

  function clickHandler(node) {
    return function onClick(evt) {
      evt.preventDefault();
      evt.stopPropagation();
      node.onClick();
    };
  }

  return Node;
});