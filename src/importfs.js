/*global define*/
define("importfs", function () {
  "use strict";

  var ignores = importEntry.ignores = [".git"];

  return importEntry;

  function importEntry(repo, entry, callback) {
    if (entry.isDirectory) return importDirectory(repo, entry, callback);
    if (entry.isFile) return importFile(repo, entry, callback);
    // console.log("UNKNOWN TYPE", entry)
  }

  function importFile(repo, entry, callback) {
    var reader = new FileReader();
    reader.onloadend = function() {
      repo.saveAs("blob", this.result, callback);
    };
    entry.file(function (file) {
      reader.readAsArrayBuffer(file);
    });
  }

  // Import a tree and callback the root hash.
  function importDirectory(repo, entry, callback) {
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
          if (ignores.indexOf(result.name) >= 0) continue;
          var entry = entries[index++] = {
            name: result.name,
            mode: result.isDirectory ? "d" : "f"
          };
          left++;
          importEntry(repo, result, onImporter(entry));
        }
        readEntries();
      }, onError);
    }

    function onError() {
      console.log(arguments);
      throw new Error("ERROR");
    }

    function onImporter(entry) {
      return function (err, hash) {
        if (err) throw err;
        entry.hash = hash;
        check();
      };
    }

    function check() {
      if (--left) return;
      repo.saveAs("tree", entries, callback);
    }
  }

});