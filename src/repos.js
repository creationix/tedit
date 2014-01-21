/*global define, chrome*/
define("repos", function () {
  var prefs = require('prefs');
  var fileSystem = chrome.fileSystem;
  var importEntry = require('importfs');

  return {
    newFromFolder: newFromFolder,
    newEmpty: newEmpty,
    // clone: clone,
  };

  // Callback contains (err, repo, name, rootHash)
  function newFromFolder(callback) {
    var repo = {};
    require('progress')(repo);
    require('indexeddb')(repo, function () {
      fileSystem.chooseEntry({ type: "openDirectory"}, onEntry);
    });

    function onEntry(entry) {
      importEntry(repo, entry, function (err, root) {
        if (err) repo.onProgress(err);
        else repo.onProgress("Imported " + entry.name);
        repo.onProgress();
        if (err) return callback(err);
        callback(null, repo, entry.name, root);
      });
    }
  }

  function newEmpty(callback) {
    var repo = {};
    require('progress')(repo);
    require('indexeddb')(repo, function () {
      repo.saveAs("tree", [], function (err, hash) {
        if (err) return callback(err);
        callback(null, repo, "new-repo", hash);
      });
    });
  }

});