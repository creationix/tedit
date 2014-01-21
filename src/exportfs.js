/*global define*/
define('exportfs', function () {
  "use strict";

  var modes = require('modes');

  return exportNode;
  function exportNode(parentEntry, repo, name, mode, hash, callback) {
    if (modes.isTree(mode)) return exportTree(parentEntry, repo, name, mode, hash, callback);
    if (modes.isBlob(mode)) return exportBlob(parentEntry, repo, name, mode, hash, callback);
    callback(new Error("Unknown mode: 0" + mode.toString(8)));
  }

  function exportTree(parentEntry, repo, name, mode, hash, callback) {
    var done = false;
    repo.loadAs("tree", hash, function (err, tree) {
      if (err) return onDone(err);
      parentEntry.getDirectory(name, {create: true}, function(dirEntry) {
        var left = 1;
        Object.keys(tree).forEach(function (name) {
          var entry = tree[name];
          left++;
          exportNode(dirEntry, repo, name, entry.mode, entry.hash, check);
        });
        check();
        function check(err) {
          if (done) return;
          if (err) return onDone(err);
          if (--left) return;
          onDone();
        }
      }, onDone);
    });

    function onDone(err) {
      if (done) return;
      done = true;
      callback(err);
    }
  }

  function exportBlob(parentEntry, repo, name, mode, hash, callback) {
    repo.loadAs("blob", hash, function (err, buffer) {
      if (err) return callback(err);
      parentEntry.getFile(name, {create: true}, function (fileEntry) {
        // Create a FileWriter object for our FileEntry (log.txt).
        fileEntry.createWriter(function(fileWriter) {
          fileWriter.onwriteend = function() { callback(); };
          fileWriter.onerror = callback;
          var blob = new Blob([buffer]);
          fileWriter.write(blob);

        }, callback);
      }, callback);
    });

  }

});