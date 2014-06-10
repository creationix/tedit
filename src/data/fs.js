define("data/fs.js", ["backends.js","prefs.js","git-tree.js"], function (module, exports) { "use strict";

var backends = require('backends.js');
var prefs = require('prefs.js');
// Data for repos is keyed by path. The root config is keyed by "".
// Live js-git instances by path
var repos = {};
// Config data by path
var configs = prefs.get("configs", {});
// Store the hash to the current root node
var rootHash = prefs.get("rootHash");

module.exports = require('git-tree.js')({
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
  for (var i = 0, l = backends.length; i < l; i++) {
    var repo = backends[i].createRepo(config);
    if (repo) return repo;
  }
}

});
