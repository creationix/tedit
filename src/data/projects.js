var findStorage = require('./storage');
var prefs = require('ui/prefs');
var clone = require('./clone');
var importEntry = require('./importfs');
var parseConfig = require('js-git/lib/config-codec').parse;
var encodeConfig = require('js-git/lib/config-codec').encode;
var binary = require('bodec');

module.exports = {
  createRepo: createRepo,
  expandConfig: expandConfig,
  loadSubModule: loadSubModule,
};

function createRepo(config) {
  var repo = {};
  if (config.githubName) {
    var githubToken = prefs.get("githubToken", "");
    if (!githubToken) throw new Error("Missing githubToken");
    require('js-git/mixins/github-db')(repo, config.githubName, githubToken);
    // Github has this built-in, but it's currently very buggy
    require('js-git/mixins/create-tree')(repo);
    // Cache github objects locally in indexeddb
    require('js-git/mixins/add-cache')(repo, require('js-git/mixins/indexed-db'));
  }
  else {
    if (!config.prefix) {
      config.prefix = Date.now().toString(36) + "-" + (Math.random() * 0x100000000).toString(36);
    }
    require('js-git/mixins/indexed-db')(repo, config.prefix);
    require('js-git/mixins/create-tree')(repo);
  }

  // require('js-git/mixins/delay')(repo, 200);

  // Cache everything except blobs over 100 bytes in memory.
  require('js-git/mixins/mem-cache')(repo);

  // Combine concurrent read requests for the same hash
  require('js-git/mixins/read-combiner')(repo);

  return repo;
}

// Take a minimal config and load enough data to make it usable
// This gurantees to at-least have a "current" hash to start walking it's tree
function expandConfig(config, callback) {
  if (!callback) return expandConfig.bind(null, config);
  var storage = findStorage(config);
  var repo = storage.repo || (storage.repo = createRepo(config));

  // First, let's lookup head if we don't know it already.
  if (config.head) return onHead();
  return repo.readRef("refs/heads/master", onHead);

  function onHead(err, hash) {
    if (err) return callback(err);
    if (hash) config.head = hash;
    if (!config.current) {
      if (config.head) config.current = config.head;
      else if (config.url) return clone(repo, config.url, onHead);
      else if (config.entry) return importEntry(repo, config.entry, onTree);
      else return initEmpty(repo, null, onCurrent);
    }
    callback(null, config);
  }

  function onTree(err, hash) {
    if (err) return callback(err);
    delete config.entry;
    initEmpty(repo, hash, onCurrent);
  }

  function onCurrent(err, hash) {
    if (!hash) return callback(err || new Error("Invalid current hash"));
    config.current = hash;
    onHead();
  }
}

// When creating new empty repos, we still need an empty tree and a temporary commit.
function initEmpty(repo, tree, callback) {
  if (tree) return onTree(null, tree);
  return repo.saveAs("tree", [], onTree);

  function onTree(err, hash) {
    if (err) return callback(err);
    return repo.saveAs("commit", {
      tree: hash,
      author: {
        name: "AutoInit",
        email: "tedit@creationix.com"
      },
      message: "Initial Empty Commit"
    }, callback);
  }
}

function loadSubModule(repo, parent, rootTree, root, path, callback) {
  var modulesEntry = rootTree[".gitmodules"];
  if (!modulesEntry) return callback(new Error("Missing " + root + "/.gitmodules needed by " + path));

  repo.loadAs("blob", modulesEntry.hash, onBlob);

  function onBlob(err, blob) {
    if (!blob) return callback(err);
    var childConfig;
    var localPath = path.substring(root.length + 1);
    try {
      var text = binary.toUnicode(blob);
      var config = parseConfig(text);
      var keys = Object.keys(config.submodule);
      var entry;
      for (var i = 0, l = keys.length; i < l; i++) {
        var key = keys[i];
        entry = config.submodule[key];
        if (entry.path === localPath) break;
      }
      if (i >= l) {
        throw new Error("Missing entry for " + localPath + " in " + root + "/.gitmodules");
      }
      if (!entry.url) throw new Error("Missing url in entry for " + localPath + " in " + root + "/.gitmodules");
      var match;
      if (parent.githubName && (match = entry.url.match(/github.com[:\/](.*?)(?:\.git)?$/))) {
        childConfig = { githubName: match[1] };
      }
      else {
        childConfig = { url: entry.url };
      }
    }
    catch (err) { return callback(err); }
    expandConfig(childConfig, callback);
  }

}
