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
    this.path = (parent ? parent.path : "") + "/" + name;
    domBuilder(["li$el",
      ["$rowEl", { onclick: clickHandler(this) },
        ["i$iconEl"], ["span$nameEl"]
      ]
    ], this);
    this.el.js = this;
    this.onChange();
  }

  Node.prototype.onChange = function () {
    var title = this.path;
    var classes = ["row"];

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

  function clickHandler(node) {
    return function (evt) {
      if (typeof node.onClick !== "function") return;
      evt.preventDefault();
      evt.stopPropagation();
      node.onClick();
    };
  }

  return Node;
});
