/*global chrome*/
"use strict";

var dialog = require('ui/dialog');
var fileSystem = chrome.fileSystem;
var readPath = require('data/fs').readPath;
var publisher = require('data/publisher');
var notify = require('ui/notify');
var modes = require('js-git/lib/modes');
var editHook = require('./edit-hook');

var memory = {};

exports.menuItem = {
  icon: "hdd",
  label: "Live Export to Disk",
  action: pushExport
};

function pushExport(row) {
  editHook(row, exportConfigDialog, addExportHook);
}


function addExportHook(row, settings) {
  var rootEntry;
  var servePath = publisher(readPath, settings);
  var dirty = null;
  row.pulse++;
  fileSystem.restoreEntry(settings.entry, function (entry) {
    if (!entry) row.fail(new Error("Failed to restore entry"));
    rootEntry = entry;
    row.pulse--;
    hook();
  });

  return hook;

  function hook() {
    if (!rootEntry) return;
    // If it's busy doing an export, put the row in the dirty queue
    if (queue) {
      dirty = row;
      return;
    }
    row.exportPath = rootEntry.fullPath + "/" + settings.name;

    // Mark the process as busy
    row.pulse++;
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
    row.pulse--;
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
    row.pulse--;
    notify("Export Failed");
    row.fail(err);
  }

  function exportPath(path, name, dir) {
    pending++;
    return servePath(path, onEntry);

    function onEntry(err, entry) {
      pending--;
      if (!entry) return onError(err || new Error("Can't find " + path));
      return exportEntry(path, name, dir, entry);
    }
  }

  function exportEntry(path, name, dir, entry) {
    var hash = memory[path];
    // Always walk trees because there might be symlinks under them that point
    // to changed content without  the tree's content actually changing.
    if (entry.mode === modes.tree) return exportTree(path, name, dir, entry);
    // If the hashes match, it means we've already exported this version of this path.
    if (hash && entry.hash === hash) {
      // console.log("Skipping", path, hash);
      return onSuccess();
    }
    notify("Exporting " + path + "...");
    // console.log("Exporting", path, hash);

    // Mark this as being saved.
    memory[path] = entry.hash;
    pending++;
    entry.fetch(onBody);

    function onBody(err, body) {
      pending--;
      if (body === undefined) return onError(err || new Error("Problem fetching response body"));
      return exportFile(name, dir, body);
    }
  }

  function exportTree(path, name, dir, entry) {
    // Create the directoy
    pending++;
    entry.fetch(function (err, tree) {
      if (err) return onError(err);
      dir.getDirectory(name, {create: true}, onDir, onError);
      function onDir(dirEntry) {
        pending--;
        // Export it's children.
        exportChildren(path, tree, dirEntry);
      }
    });

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


function exportConfigDialog(config, callback) {
  var entry;
  var $ = dialog("Export Config", [
    ["form", {onsubmit: submit},
      ["label", {"for": "target"}, "Target Parent Folder"],
      [".input",
        ["input.input-field$target", {
          name: "target",
          onclick: chooseFolder,
          onkeyup: reset,
          required: true
        }],
        ["button.input-item", {onclick: chooseFolder}, "Choose..."]
      ],
      ["label", {"for": "name"}, "Target Name"],
      [".input",
        ["input.input-field$name", {
          name: "name",
          value: config.name,
          required: true
        }],
      ],
      ["label", {"for": "source"}, "Source Path"],
      [".input",
        ["input.input-field$source", {
          name: "source",
          value: config.source,
          required: true
        }],
      ],
      ["label", {"for": "filters"}, "Filters Path"],
      [".input",
        ["input.input-field$filters", {
          name: "filters",
          value: config.filters,
        }],
        ["input.input-item$submit", {type:"submit",value:"OK"}]
      ]
    ]
  ], onCancel);

  if (config.entry) {
    return fileSystem.isRestorable(config.entry, onCheck);
  }
  return reset();

  function onCheck(isRestorable) {
    if (!isRestorable) {
      delete config.entry;
      return reset();
    }
    return fileSystem.restoreEntry(config.entry, onEntry);
  }

  function onEntry(result) {
    if (result) entry = result;
    return reset();
  }

  function onCancel(evt) {
    nullify(evt);
    $.close();
    callback();
  }

  function reset() {
    $.target.value = entry && entry.fullPath || "";
  }

  function submit(evt) {
    nullify(evt);

    config.source = $.source.value;
    config.name = $.name.value;
    config.filters = $.filters.value;
    config.entry = fileSystem.retainEntry(entry);
    $.close();
    callback(config);
  }

  function chooseFolder(evt) {
    nullify(evt);
    return fileSystem.chooseEntry({ type: "openDirectory"}, onEntry);
  }

}

function nullify(evt) {
  if (!evt) return;
  evt.stopPropagation();
  evt.preventDefault();
}
