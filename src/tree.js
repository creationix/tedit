/*global define*/
define("tree", function () {
  "use strict";

  var $ = require('elements');
  var Node = require('tree/node');
  var Dir = require('tree/dir');
  var File = require('tree/file');
  var SymLink = require('tree/link');
  var domBuilder = require('dombuilder');
  var modes = require('modes');

  Node.create = function (repo, name, mode, hash, parent) {
    if (modes.isFile(mode)) return new File(repo, name, mode, hash, parent);
    if (modes.isTree(mode)) return new Dir(repo, name, mode, hash, parent);
    if (modes.isSymLink(mode)) return new SymLink(repo, name, mode, hash, parent);
    throw new TypeError("Invalid mode 0" + mode.toString(8));
  };

  require('repos')(function (err, repo, root, entry) {
    if (err) throw err;
    repo.name = entry.fullPath;
    $.tree.appendChild(domBuilder(["ul", (new Dir(repo, entry.name, modes.tree, root)).el]));
  });

  function focus() {
    console.log("TODO: focus");
  }

  return {
    focus: focus
  };
});
