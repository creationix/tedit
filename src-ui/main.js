"use strict";

var repo = {};
yield require('js-git/mixins/indexed-db').init;
require('js-git/mixins/indexed-db')(repo, "test.git");
require('js-git/mixins/path-to-entry')(repo);
require('js-git/mixins/create-tree')(repo);
// require('js-git/mixins/walkers')(repo);
// require('js-git/mixins/pack-ops')(repo);
// require('js-git/mixins/delay')(repo, 100);
require('js-git/mixins/formats')(repo);

var modes = require('js-git/lib/modes');

// var domChanger = require('domchanger/domchanger.js');
// var Tree = require('./tree');

// domChanger(Tree, document.body).update(repo, "test.git");

var head = yield repo.readRef("refs/heads/master");
var commit = yield repo.loadAs("commit", head);

var begin = require('./locker')(repo, commit.tree);

var op = yield* begin("www");
var entry = yield* op.read("www");
console.log(entry);
yield* op.end();
op = yield* begin("", true);
var repo = yield* op.getRepo("www/greeting.txt");
yield* op.write("www/greeting.txt", {
  mode: modes.blob,
  hash: yield repo.saveAs("blob", "Hello World")
});
