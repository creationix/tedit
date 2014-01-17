/*global define, chrome*/
define("repos", function () {
  var encoders = require('encoders');
  var prefs = require('prefs');
  var fileSystem = chrome.fileSystem;
  var repo = {};
  var root;

  var ignores = {
    ".git": true,
    "tags": true,
    ".zedstate": true,
    // "ace": true
  };

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
    importTree(entry, function (err, root) {
      if (err) throw err;
      console.log("ROOT", root);
    });
  }

  function importEntry(entry, callback) {
    if (entry.isDirectory) return importTree(entry, callback);
    if (entry.isFile) return importBlob(entry, callback);
    // console.log("UNKNOWN TYPE", entry)
  }

  function importBlob(entry, callback) {
    var reader = new FileReader();
    reader.onloadend = function() {
      var body = this.result;
      var hash = encoders.hashBlob(body);
      repo[hash] = body;
      console.log("BLOB", hash);
      callback(null, hash);
    };
    entry.file(function (file) {
      reader.readAsArrayBuffer(file);
    });
  }

  // Import a tree and callback the root hash.
  function importTree(entry, callback) {
    var reader = entry.createReader();
    var left = 1;
    var entries = [];
    var index = 0;
    readEntries();

    function readEntries() {
      reader.readEntries(function (results) {
        var length = results.length;
        if (!results.length) return check();
        for (var i = 0; i < length; i++) {
          var result = results[i];
          if (ignores[result.name]) continue;
          entries[index] = {
            name: result.name,
            // TODO: check for symlinks and executable files too
            mode: result.isDirectory ? 040000 : 0100644
          };
          left++;
          importEntry(result, onImporter(index));
          index++;
        }
        readEntries();
      }, onError);
    }

    function onError() {
      console.log(arguments);
      throw new Error("ERROR");
    }

    function onImporter(index) {
      return function (err, hash) {
        if (err) throw err;
        entries[index].hash = hash;
        check();
      };
    }

    function check() {
      if (--left) return;
      var hash = encoders.hashTree(entries);
      console.log("TREE", hash);
      repo[hash] = entries;
      callback(null, hash);
    }
  }

});