/*global define, chrome*/
define("repos", function () {
  var prefs = require('prefs');
  var fileSystem = chrome.fileSystem;
  var importEntry = require('importfs');
  importEntry.ignores.push("tags", ".zedstate", "ace");

  var repo = {};
  require('memdb')(repo);

  var retainer = prefs.get("retainer");
  if (retainer) {
    fileSystem.isRestorable(retainer, function (isRestorable) {
      if (isRestorable) {
        fileSystem.restoreEntry(retainer, onEntry);
      }
      else {
        fileSystem.chooseEntry({ type: "openDirectory"}, onDir);
      }
    });
  }
  else {
    fileSystem.chooseEntry({ type: "openDirectory"}, onDir);
  }

  function onDir(entry) {
    prefs.set("retainer", fileSystem.retainEntry(entry));
    onEntry(entry);
  }

  function onEntry(entry) {
    importEntry(repo, entry, function (err, root) {
      if (err) throw err;
      console.log("ROOT", root);
    });
  }

});