/*global define, chrome*/
/*jshint unused:strict,undef:true,trailing:true */
define("data/live", function () {

  var fileSystem = chrome.fileSystem;
  var fail = require('ui/fail');
  var pathToEntry = require('data/repos').pathToEntry;
  var publisher = require('data/publisher');
  var handlers = {
    amd: require("filters/amd")
  };

  var memory = {};

  return {
    addExportHook: addExportHook
  };

  function addExportHook(node, settings) {
    var rootEntry;
    var servePath = publisher(pathToEntry, handleFilter);
    var dirty = null;
    node.pulse = true;
    fileSystem.restoreEntry(settings.entry, function (entry) {
      if (!entry) fail(node, new Error("Failed to restore entry"));
      rootEntry = entry;
      node.pulse = false;
      hook(node);
    });

    return hook;

    function hook(node) {
      // If it's busy doing an export, put the node in the dirty queue
      if (node.pulse) {
        dirty = node;
        return;
      }
      node.exportPath = rootEntry.fullPath + "/" + settings.name;

      // Mark the process as busy
      node.pulse = true;
      console.log("Export Start");
      
      // Run the export script
      exportPath(settings.source, settings.name, rootEntry, onExport, onFail);

      function onExport() {
        node.pulse = false;
        console.log("Export Done");
        // If there was a pending request, run it now.
        if (dirty) {
          var newNode = dirty;
          dirty = null;
          hook(newNode);
        }
      }
      
      function onFail(err) {
        node.pulse = false;
        fail(node, err);
      }

    }
      

    function exportPath(path, name, dir, onSuccess, onError) {
      var etag = memory[path];
      servePath(path, etag, onResult);
      
      function onResult(err, result) {
        if (!result) return onError(err || new Error("Can't find " + path));
        // Always walk trees because there might be symlinks under them that point
        // to changed content without  the tree's content actually changing.
        if (result.tree) return exportTree(path, name, dir, result.tree, onSuccess, onError);
        // If the etags match, it means we've already exported this version of this path.
        if (etag && result.etag === etag) {
          console.log("Skipping", path, etag)
          return onSuccess();
        }
        // Mark this as being saved.
        memory[path] = result.etag;
        result.fetch(onBody);
      }

      function onBody(err, body) {
        if (body === undefined) return onError(err || new Error("Problem fetching response body"));
        return exportFile(name, dir, body, onSuccess, onError);
      }
    }
    
    function exportTree(path, name, dir, tree, onSuccess, onError) {
      // Create the directoy
      dir.getDirectory(name, {create: true}, onDir, onError);

      function onDir(dirEntry) {
        // Export it's children.
        exportChildren(path, tree, dirEntry, onSuccess, onError);
      }
    }
    
    function exportChildren(base, tree, dir, onSuccess, onError) {
      var names = Object.keys(tree);
      check();
      
      function check() {
        var name = names.shift();
        if (!name) {
          return onSuccess();
        }
        exportPath(base + "/" + name, name, dir, check, onError);
      }
    }

    function exportFile(name, dir, body, onSuccess, onError) {
      // Flag for onWriteEnd to know state
      var truncated = false;
      
      // Create the file
      dir.getFile(name, {create:true}, onFile, onError);

      // Create a writer for the file
      function onFile(file) {
        file.createWriter(onWriter, onError);
      }
  
      // Setup the writer and start the write
      function onWriter(fileWriter) {
        fileWriter.onwriteend = onWriteEnd;
        fileWriter.onerror = onError;
        fileWriter.write(new Blob([body]));
      }

      // This gets called twice.  The first calls truncate and then comes back.
      function onWriteEnd() {
        if (truncated) return onSuccess();
        truncated = true;
        // Trim any extra data leftover from a previous version of the file.
        this.truncate(this.position);
      }
    }

    function handleFilter(req, callback) {
      var handler = handlers[req.name];
      if (handler) return handler(servePath, req, callback);
      return callback(new Error("Unknown filter handler " + JSON.stringify(req.name)));
    }
  }


});