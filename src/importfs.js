/*global define*/
define("importfs", function () {
  "use strict";

  var modes = require('modes');
  var notify = require('notify');
  var ignores = importEntry.ignores = [".git", "node_modules"];

  return importEntry;

  function importEntry(repo, entry, callback) {
    notify("Importing " + entry.fullPath);
    repo.importStatus = "Loading " + entry.fullPath;
    if (entry.isDirectory) return importDirectory(repo, entry, callback);
    if (entry.isFile) return importFile(repo, entry, callback);
    console.error("UNKNOWN TYPE", entry);
  }

  function importFile(repo, entry, callback) {
    var reader = new FileReader();
    reader.onloadend = function() {
      repo.saveAs("blob", this.result, function (err, hash) {
        if (err) return callback(err);
        callback(null, hash, entry.name);
      });
    };
    entry.file(function (file) {
      reader.readAsArrayBuffer(file);
    });
  }

  // Import a tree and callback the root hash.
  function importDirectory(repo, dirEntry, callback) {
    var reader = dirEntry.createReader();

    // Build a tree
    var tree = [];
    var treeOffset = 0;
    var item;

    // Loop over result chunks
    var entries;
    var length;
    var index;
    return reader.readEntries(onEntries, onError);

    function onEntries(results) {
      length = results.length;
      if (!length) {
        return repo.saveAs("tree", tree, function (err, hash) {
          if (err) return callback(err);
          callback(null, hash, dirEntry.name);
        });
      }
      entries = results;
      index = 0;
      loadNext();
    }

    function loadNext() {
      if (index >= length) {
        return reader.readEntries(onEntries, onError);
      }
      var result = entries[index++];
      if (ignores.indexOf(result.name) >= 0) {
        return loadNext();
      }
      item = tree[treeOffset++] = {
        name: result.name,
        mode: result.isDirectory ? modes.tree : modes.blob
      };
      importEntry(repo, result, onImport);
    }

    function onImport(err, hash) {
      if (err) throw err;
      item.hash = hash;
      loadNext();
    }

    function onError() {
      console.log(arguments);
      throw new Error("ERROR");
    }
  }

});