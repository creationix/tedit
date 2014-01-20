/*global define, chrome*/
define("repos", function () {
  var prefs = require('prefs');
  var fileSystem = chrome.fileSystem;
  var importEntry = require('importfs');

  return {
    newFromFolder: newFromFolder,
    // newEmpty: newEmpty,
    // clone: clone,
  };

  // Callback contains (err, repo, name, rootHash)
  function newFromFolder(callback) {
    var repo = {};
    require('progress')(repo);
    require('memdb')(repo);

    // var retainer = prefs.get("retainer");
    // if (retainer) {
    //   fileSystem.isRestorable(retainer, function (isRestorable) {
    //     if (isRestorable) {
    //       fileSystem.restoreEntry(retainer, onEntry);
    //     }
    //     else {
    //       fileSystem.chooseEntry({ type: "openDirectory"}, onDir);
    //     }
    //   });
    // }
    // else {
      fileSystem.chooseEntry({ type: "openDirectory"}, onEntry);
    // }

    // function onDir(entry) {
    //   prefs.set("retainer", fileSystem.retainEntry(entry));
    //   onEntry(entry);
    // }

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

});