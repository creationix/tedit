/*global define, chrome*/
define("live", function () {

  var fileSystem = chrome.fileSystem;
  var pathToEntry = require('repos').pathToEntry;
  var fail = require('fail');

  return {
    addExportHook: addExportHook
  };

  function addExportHook(node, config) {
    var ready = false;
    var rootEntry;
    fileSystem.restoreEntry(config.entry, function (entry) {
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
      console.log("Push Detected");
      console.log(config);
      setTimeout(function () {
        node.pulse = false;
      }, 1000);
    }
  }

});