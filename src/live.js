/*global define*/
define("live", function () {
  // Live hooks configs by path
  var prefs = require('prefs');
  var hookPaths = prefs.get("hookPaths", {});

  return {
    hookPaths: hookPaths, // Exported so tree row can show it visually
    addExportHook: addExportHook
  };

  function addExportHook(node, parentEntry) {
    
  }

});