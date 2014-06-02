define("runtimes/edit-hook.js", ["data/fs.js","prefs.js","data/hooks.js"], function (module, exports) { var fs = require('data/fs.js');
var prefs = require('prefs.js');
var hookConfigs = prefs.get("hookConfigs", {});
var hooks = require('data/hooks.js');

module.exports = editHook;
function editHook(row, dialogFn, action) {
  row.call(fs.readEntry, function (entry) {
    var config = hookConfigs[row.path] || {
      entry: prefs.get("defaultExportEntry"),
      source: row.path,
      port: 8080,
      filters: entry.root + "/filters",
      name: row.path.substring(row.path.lastIndexOf("/") + 1)
    };
    dialogFn(config, function (settings) {
      if (!settings) return;
      hookConfigs[row.path] = settings;
      if (settings.entry) prefs.set("defaultExportEntry", settings.entry);
      hooks[row.path] = action(row, settings);
      prefs.save();
    });
  });
}

});
