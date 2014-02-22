/*global chrome*/

var fileSystem = chrome.fileSystem;
var readEntry = require('./fs').readEntry;
var publisher = require('data/publisher');
var notify = require('ui/notify');

var memory = {};

module.exports = {
  addExportHook: addExportHook
};

function addExportHook(row, settings) {
  var rootEntry;
  var servePath = publisher(readEntry, settings);
  var dirty = null;
  row.pulse = true;
  fileSystem.restoreEntry(settings.entry, function (entry) {
    if (!entry) row.fail(new Error("Failed to restore entry"));
    rootEntry = entry;
    row.pulse = false;
    hook(row);
  });

  return hook;

  function hook(rootHash) {
    if (!rootEntry) return;
    // If it's busy doing an export, put the row in the dirty queue
    if (queue) {
      dirty = row;
      return;
    }
    row.exportPath = rootEntry.fullPath + "/" + settings.name;

    // Mark the process as busy
    row.pulse = true;
    queue = [];

    pending = 0;
    enqueue(exportPath, settings.source, settings.name, rootEntry);
    onSuccess();
  }

  function enqueue(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    queue.push({fn:fn,args:args});
  }

  var queue, checking, pending, sync;
  function onSuccess() {
    if (checking) {
      sync = true;
      return;
    }
    checking = true;
    while (queue.length) {
      var next = queue.shift();
      sync = false;
      next.fn.apply(null, next.args);
      if (!sync) break;
    }
    checking = false;
    if (!pending) onDone();
  }

  function onDone() {
    row.pulse = false;
    queue = null;
    notify("Finished Export to " + rootEntry.fullPath + "/" + settings.name);
    // If there was a pending request, run it now.
    if (dirty) {
      var newrow = dirty;
      dirty = null;
      hook(newrow);
    }
  }

  function onError(err) {
    row.pulse = false;
    notify("Export Failed");
    row.fail(err);
  }

  function exportPath(path, name, dir) {
    var etag = memory[path];
    pending++;
    return servePath(path, etag, onEntry);

    function onEntry(err, entry) {
      pending--;
      if (!entry) return onError(err || new Error("Can't find " + path));
      return exportEntry(path, name, dir, entry);
    }
  }

  function exportEntry(path, name, dir, entry) {
    var etag = memory[path];
    // Always walk trees because there might be symlinks under them that point
    // to changed content without  the tree's content actually changing.
    if (entry.tree) return exportTree(path, name, dir, entry.tree);
    // If the etags match, it means we've already exported this version of this path.
    if (etag && entry.etag === etag) {
      // console.log("Skipping", path, etag);
      return onSuccess();
    }
    notify("Exporting " + path + "...");
    // console.log("Exporting", path, etag);

    // Mark this as being saved.
    memory[path] = entry.etag;
    pending++;
    entry.fetch(onBody);

    function onBody(err, body) {
      pending--;
      if (body === undefined) return onError(err || new Error("Problem fetching response body"));
      return exportFile(name, dir, body);
    }
  }

  function exportTree(path, name, dir, tree) {
    // Create the directoy
    pending++;
    dir.getDirectory(name, {create: true}, onDir, onError);

    function onDir(dirEntry) {
      pending--;
      // Export it's children.
      exportChildren(path, tree, dirEntry);
    }
  }

  function exportChildren(base, tree, dir) {
    Object.keys(tree).forEach(function (name) {
      enqueue(exportPath, base + "/" + name, name, dir);
    });
    onSuccess();
  }

  function exportFile(name, dir, body) {
    // Flag for onWriteEnd to know state
    var truncated = false;

    // Create the file
    pending++;
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
      if (truncated) {
        pending--;
        return onSuccess();
      }
      truncated = true;
      // Trim any extra data leftover from a previous version of the file.
      this.truncate(this.position);
    }
  }
}
