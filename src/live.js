/*global define, chrome*/
define("live", function () {

  var fileSystem = chrome.fileSystem;
  var pathToEntry = require('repos').pathToEntry;
  var modes = require('modes');
  var fail = require('fail');
  
  var memory = {};

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
      var mode = modes.tree;
      pathToEntry(settings.source, function (err, entry) {
        if (err) fail(node, err);
        exportEntry(entry, settings.source, rootEntry, settings.name, function (err) {
          if (err) fail(node, err);
          node.pulse = false;
        });
      });
    }
  }

  function exportEntry(entry, path, parentEntry, name, callback) {
    if (memory(path) === entry.hash) return callback();
    memory[path] = entry.hash;
    if (modes.isFile(entry,mode)) {
      return exportFile(path, parentEntry, name, callback);
    }
    if (entry,mode === modes.tree || entry,mode === modes.commit) {
      return exportTree(path, parentEntry, name, callback);
    }
    if (entry,mode === modes.sym) {
      return exportSymLink(path, parentEntry, name, callback);
    }
    callback(new Error("Invalid mode 0" + entry.mode.toString(8)));
  }


  function exportTree(path, parentEntry, name, callback) {
    console.log("exportTree", path);
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
        left++;
        exportEntry(entry, childPath, dirEntry, childName, check);
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
    console.log("exportFile", path);
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

  function exportSymLink(path, parentEntry, name, callback) {
    console.log("exportSym", path);
    pathToEntry(path, function (err, entry) {
      if (err) return callback(err);
      var newPath = pathJoin(path, "..", entry.link.trim());
      pathToEntry(newPath, function (err, newEntry) {
        if (err) return callback(err);
        if (!newEntry) {
          console.error("Dangling symlink " + path + " -> " + newPath);
          return callback();
        }
        exportEntry(newEntry, newPath, parentEntry, name, callback);
      });
    });
  }

  // TODO: process the error data and create a proper error object
  function processError(cb) { return cb; }

  function pathJoin(/* path segments */) {
    // Split the inputs into a list of path commands.
    var parts = [];
    for (var i = 0, l = arguments.length; i < l; i++) {
      parts = parts.concat(arguments[i].split("/"));
    }
    // Interpret the path commands to get the new resolved path.
    var newParts = [];
    for (i = 0, l = parts.length; i < l; i++) {
      var part = parts[i];
      // Remove leading and trailing slashes
      // Also remove "." segments
      if (!part || part === ".") continue;
      // Interpret ".." to pop the last segment
      if (part === "..") newParts.pop();
      // Push new path segments.
      else newParts.push(part);
    }
    // Preserve the initial slash if there was one.
    if (parts[0] === "") newParts.unshift("");
    // Turn back into a single string path.
    return newParts.join("/") || (newParts.length ? "/" : ".");
  }

});