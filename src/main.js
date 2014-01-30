/*global define*/
define("main", function () {
  "use strict";

  require('parallel')([
    // Initialize the subsystems in parallel for fast boot
    require('prefs').init,
    require('indexeddb').init
  ], function () {
    // // Load the main GUI components
    require('tree');
    require('editor');
    require('slider');
  });
});
