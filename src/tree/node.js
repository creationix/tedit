/*global define*/
define("tree/node", function () {
  "use strict";

  var domBuilder = require('dombuilder');
  var modes = require('modes');
  var getMime = require('mime')();

  function Node(repo, name, mode, hash, parent) {
    this.repo = repo;
    this.hash = hash;
    this.mode = mode;
    this.name = name;
    this.parent = parent;
    this.path = Node.calcPath(parent, name);
    if (!this.el) {
      domBuilder(["li$el",
        ["$rowEl", { onclick: clickHandler(this) },
          ["i$iconEl"], ["span$nameEl"]
        ]
      ], this);
      this.el.js = this;
    }
    this.onChange();
  }

  Node.calcPath = function (parent, name) {
    return (parent ? parent.path : "") + "/" + name;
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
    if (modes.isTree(this.mode)) {
      // Root tree gets a box icon since it represents the repo.
      if (!this.parent) {
        if (this.children) classes.push("icon-book-open");
        else classes.push("icon-book");
      }
      // Tree nodes with children are open
      else if (this.children) classes.push("icon-folder-open");
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

  Node.selected = null;
  Node.activated = null;
  Node.activatedPath = null;

  Node.click = function (node, arg) {
    Node.focus();
    if (Node.activated === node) {
      Node.deactivate(node);
      if (Node.selected !== node) {
        Node.select(node);
      }
    }
    else if (Node.selected === node) {
      if (node.onActivate) Node.activate(node, arg);
      else if (node.onToggle) node.onToggle();
    }
    else {
      Node.select(node);
      if (node.onToggle) node.onToggle();
    }
  };

  Node.select = function (node) {
    var old = Node.selected;
    Node.selected = node;
    if (old) {
      if (old.onDeselect) old.onDeselect();
      old.onChange();
    }
    if (node) {
      if (node.onSelect) node.onSelect();
      node.onChange();
      Node.scrollTo(node);
    }
  };

  Node.activate = function (node, arg) {
    var old = Node.activated;
    Node.activated = node;
    Node.activatedPath = node && node.path;
    if (old) {
      if (old.onDeactivate) old.onDeactivate();
      old.onChange();
    }
    if (node) {
      if (node.onActivate) node.onActivate(arg);
      node.onChange();
      Node.scrollTo(node);
    }
  };

  Node.deactivate = function (node) {
    if (Node.activated !== node) {
      throw new Error("Can't deactivate non-active node");
    }
    Node.activate();
  };

  Node.left = function () {
    var self = Node.selected;
    if (self.children) {
      return self.onToggle();
    }
    var parent = self.parent;
    if (parent) Node.select(parent);
  };

  Node.right = function () {
    var self = Node.selected;
    if (self.children) {
      if (self.children.length) {
        Node.select(self.children[0]);
      }
      return;
    }
    if (self.onToggle) self.onToggle();
  };

  Node.up = function () {
    var self = Node.selected;
    var parent = self.parent;
    if (!parent) return;
    var index = parent.children.indexOf(self);
    if (index === 0) return Node.select(parent);
    var next = parent.children[index - 1];
    while(next.children && next.children.length) next = next.children[next.children.length - 1];
    Node.select(next);
  };

  Node.down = function () {
    var self = Node.selected;
    if (self.children && self.children.length) {
      return Node.select(self.children[0]);
    }
    while (self) {
      var parent = self.parent;
      if (!parent) return;
      var index = parent.children.indexOf(self);
      if (index < parent.children.length - 1) {
        return Node.select(parent.children[index + 1]);
      }
      self = parent;
    }
  };

  Node.home = function () {
    Node.select(Node.root);
  };

  Node.end = function () {
    var last = Node.root;
    while (last.children && last.children.length) {
      last = last.children[last.children.length - 1];
    }
    Node.select(last);
  };

  Node.pageUp = function () {
    for (var i = 0; i < 10; i++) Node.up();
  };

  Node.pageDown = function () {
    for (var i = 0; i < 10; i++) Node.down();
  };

  function clickHandler(node) {
    return function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      Node.click(node);
    };
  }

  return Node;
});
