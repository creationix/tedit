"use strict";

var backends = require('backends');
var prefs = require('prefs');
// Data for repos is keyed by path. The root config is keyed by "".
// Live js-git instances by path
var repos = {};
// Config data by path
var configs = prefs.get("configs", {});
// Store the hash to the current root node
var rootHash = prefs.get("rootHash");

module.exports = require('git-tree')({
  configs: configs,
  repos: repos,
  getRootHash: function () { return rootHash; },
  setRootHash: function (hash) {
    rootHash = hash;
    prefs.set("rootHash", hash);
  },
  saveConfig: prefs.save,
  createRepo: createRepo,
});
module.exports.repos = repos;
module.exports.configs = configs;

// Create a repo instance from a config
function createRepo(config) {
  var names = Object.keys(backends);
  for (var i = 0, l = names.length; i < l; i++) {
    var repo = backends[names[i]].createRepo(config);
    if (repo) return repo;
  }
}
