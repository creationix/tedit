define("runtimes/local-export.js", ["ui/tree.js","carallel.js","pathjoin.js","ui/dialog.js","js-git/lib/defer.js","data/fs.js","data/publisher.js","ui/notify.js","js-git/lib/modes.js","runtimes/edit-hook.js"], function (module, exports) { "use strict";

var tree = require('ui/tree.js');
var carallel = require('carallel.js');
var pathJoin = require('pathjoin.js');
var dialog = require('ui/dialog.js');
var defer = require('js-git/lib/defer.js');
var fs = require('data/fs.js');
var readPath = fs.readPath;
var publisher = require('data/publisher.js');
var notify = require('ui/notify.js');
var modes = require('js-git/lib/modes.js');
var editHook = require('runtimes/edit-hook.js');

var memory = {};

exports.menuItem = {
  icon: "folder-open",
  label: "Live Export to VFS",
  action: pushExport
};

function pushExport(row) {
  editHook(row, exportConfigDialog, addExportHook);
}

function addExportHook(row, settings) {
  console.warn("addExportHook", row, settings);
  var servePath = publisher(readPath, settings);
  var dirty = null;
  var toWrite = null;
  defer(hook);

  return hook;

  function hook() {
    // If it's busy doing an export, put the row in the dirty slot
    if (toWrite) {
      dirty = row;
      return;
    }
    row.exportPath = settings.name;

    // Mark the process as busy
    row.pulse++;
    toWrite = {};
    var old = fs.configs[""].current;

    doExport(settings.source, settings.name, function (err) {
      row.pulse--;
      toWrite = null;
      if (err) {
        notify("Export Failed");
        return row.fail(err);
      }
      if (old !== fs.configs[""].current) {
        notify("Finished Export to " + settings.name);
        tree.onChange(fs.configs[""].current);
      }

      // If there was a pending request, run it now.
      if (dirty) {
        var newrow = dirty;
        dirty = null;
        hook(newrow);
      }
    });
  }

  function doExport(source, target, callback) {
    exportPath(source, target, function (err) {
      if (err) return callback(err);
      var paths = Object.keys(toWrite);
      if (!paths.length) return callback();
      notify("Updating trees...");
      carallel(paths.map(function (path) {
        return fs.writeEntry(path, toWrite[path]);
      }), callback);
    });
  }

  function exportPath(source, target, callback) {
    if (!callback) return exportPath.bind(null, source, target);
    servePath(source, function (err, entry) {
      if (!entry) return callback(err || new Error("Can't find " + source));
      // Always walk trees because there might be symlinks under them that point
      // to changed content without the tree's content actually changing.
      if (entry.mode === modes.tree) {
        return exportTree(source, target, entry, callback);
      }
      // Skip already exported files
      var hash = memory[source];
      if (hash && entry.hash === hash) {
        return callback();
      }
      exportFile(source, target, entry, callback);
    });
  }

  function exportTree(source, target, entry, callback) {
    entry.fetch(function (err, tree) {
      if (err) return callback(err);
      var names = Object.keys(tree);
      serial(names.map(function (name) {
        return exportPath(pathJoin(source, name), pathJoin(target, name));
      }), 4, callback);
    });
  }

  function exportFile(source, target, entry, callback) {
    notify("Reading " + source + "...");
    entry.fetch(onBody);
    fs.readRepo(target, onRepo);
    var body, repo;
    function onBody(err, result) {
      if (!result) return callback(err || new Error("Missing body"));
      body = result;
      if (repo) add();
    }
    function onRepo(err, result) {
      if (!result) return callback(err || new Error("Missing repo"));
      repo = result;
      if (body) add();
    }

    function add() {
      notify("Writing " + target + "...");
      repo.saveAs("blob", body, function (err, hash) {
        // record as being saved
        memory[source] = entry.hash;
        toWrite[target] = {
          mode: modes.blob,
          hash: hash
        };
        callback();
      });
    }
  }

}

function exportConfigDialog(config, callback) {
  var $ = dialog("Export Config", [
    ["form", {onsubmit: submit},
      ["label", {"for": "name"}, "Target Path"],
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


  function onCancel(evt) {
    nullify(evt);
    $.close();
    callback();
  }

  function submit(evt) {
    nullify(evt);

    config.source = $.source.value;
    config.name = $.name.value;
    config.filters = $.filters.value;
    $.close();
    callback(config);
  }

}

function nullify(evt) {
  if (!evt) return;
  evt.stopPropagation();
  evt.preventDefault();
}

function serial(actions, num, callback) {
  var i = 0, l = actions.length;
  var left = l;
  var results = new Array(l);
  var done = false;
  for (var j = 0; j < num; j++) {
    check();
  }

  function check() {
    if (done) return;
    if (i < l) load(i++);
  }

  function load(index) {
    actions[index](function (err, result) {
      results[index] = result;
      left--;
      if (done) return;
      if (err || !left) {
        done = true;
        return callback(err, result);
      }
      check();
    });
  }
}
});
