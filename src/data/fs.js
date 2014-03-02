var prefs = require('./prefs');

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

// Create a repo instance from a config
function createRepo(config) {
  var repo = {};
  if (config.github) {
    if (!config.url) throw new Error("Missing url in github config");
    var githubName = getGithubName(config.url);
    var githubToken = prefs.get("githubToken", "");
    if (!githubToken) throw new Error("Missing github access token");
    require('js-git/mixins/github-db')(repo, githubName, githubToken);
    // Github has this built-in, but it's currently very buggy
    require('js-git/mixins/create-tree')(repo);
    // Cache github objects locally in indexeddb
    require('js-git/mixins/add-cache')(repo, require('js-git/mixins/indexed-db'));
  }
  else {
    // Prefix so we can find our refs after a reload
    if (!config.prefix) {
      config.prefix = Date.now().toString(36) + "-" + (Math.random() * 0x100000000).toString(36);
      prefs.save();
    }
    require('js-git/mixins/indexed-db')(repo, config.prefix);
    require('js-git/mixins/create-tree')(repo);
  }

  // require('js-git/mixins/delay')(repo, 200);

  // Cache everything except blobs over 100 bytes in memory.
  require('js-git/mixins/mem-cache')(repo);

  // // Combine concurrent read requests for the same hash
  require('js-git/mixins/read-combiner')(repo);

  return repo;
}

function getGithubName(url) {
  var match = url.match(/github.com[:\/](.*?)(?:\.git)?$/);
  if (!match) throw new Error("Url is not github repo: " + url);
  return match[1];
}
