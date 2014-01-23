/*global define*/
define("tree2/commit", function () {
  "use strict";
  var Tree = require("tree2/tree");
  var domBuilder = require('dombuilder');

  function Commit(repo, name, hash, parent) {
    var commit = repo.getCached(hash);
    if (!commit) throw new Error("commit must be cached");
    this.hash = hash;
    this.parent = parent || null;
    repo.root = commit.tree;
    var tree = new Tree(repo, "", name, this);
    var fork = domBuilder(["i.icon-fork.tight$forkEl"], this);
    tree.rowEl.insertBefore(fork, tree.nameEl);
    this.el = tree.el;
    chain(tree, this, "onChange");
    this.onChange();
  }

  Commit.prototype.onChange = function () {
    this.forkEl.setAttribute("title", this.hash);
  };

  function chain(target, self, name) {
    var original = target[name];
    target[name] = function () {
      original.apply(target, arguments);
      self[name].apply(self, arguments);
    };
  }


  return Commit;
});