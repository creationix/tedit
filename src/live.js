/*global define, chrome*/
define("live", function () {

  var fileSystem = chrome.fileSystem;
  var pathToEntry = require('repos').pathToEntry;
  var modes = require('modes');
  var fail = require('fail');

  return {
    addExportHook: addExportHook
  };

  function addExportHook(node, settings, config) {
    var ready = false;
    var rootEntry;
    fileSystem.restoreEntry(settings.entry, function (entry) {
      if (!entry) fail(node, new Error("Failed to restore entry"));
      rootEntry = entry;
      ready = true;
      hook(node, config);
    });
    return hook;
    function hook(node, config) {
      if (!ready) return;
      node.exportPath = rootEntry.fullPath;
      node.pulse = true;
      console.log("PUSH", {
        settings: settings,
        config: config
      });
      exportTree(settings.source, rootEntry, settings.name, function (err) {
        if (err) fail(node, err);
        node.pulse = false;
      });
    }
  }

  function exportTree(path, parentEntry, name, callback) {
    console.log("exportTree", {
      path: path,
      parent: parentEntry.fullPath,
      name: name
    });
    var onError = processError(callback);
    var treeEntry, left = 0, done = false;
    return pathToEntry(path, onEntry);

    function onEntry(err, result) {
      if (!result) return callback(err || new Error("Can't find source"));
      treeEntry = result;
      parentEntry.getDirectory(name, {create: true}, onDir, onError);
    }

    function onDir(dirEntry) {
      left = 1;
      Object.keys(treeEntry.tree).forEach(function (childName) {
        var entry = treeEntry.tree[childName];
        var childPath = path + "/" + childName;
        if (modes.isFile(entry.mode)) {
          left++;
          return exportFile(childPath, dirEntry, childName, check);
        }
        if (entry.mode === modes.tree || entry.mode === modes.commit) {
          left++;
          return exportTree(childPath, dirEntry, childName, check);
        }
        console.error("TODO: handle symlinks", childPath);
      });
      check();
    }

    function check(err) {
      if (done) return;
      if (err) {
        done = true;
        return callback(err);
      }
      if (--left) return;
      done = true;
      callback();
    }

  }

  function exportFile(path, parentEntry, name, callback) {
    console.log("exportFile", {
      path: path,
      parent: parentEntry.fullPath,
      name: name
    });
    var onError = processError(callback);
    var blob;
    return pathToEntry(path, onEntry);

    function onEntry(err, entry, repo) {
      if (err) return callback(err);
      repo.loadAs("blob", entry.hash, onBlob);
    }

    function onBlob(err, result) {
      if (err) return callback(err);
      blob = result;
      parentEntry.getFile(name, {create:true}, onFile, onError);
    }

    function onFile(file) {
      file.createWriter(onWriter, onError);
    }

    function onWriter(fileWriter) {

      fileWriter.onwriteend = function () {
        callback();
      };

      fileWriter.onerror = function (e) {
        callback(new Error(e.toString));
      };

      fileWriter.write(new Blob([blob]));

    }
  }

  // TODO: process the error data and create a proper error object
  function processError(cb) { return cb; }

});