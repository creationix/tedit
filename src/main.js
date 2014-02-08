/*global define*/
define("main", function () {
  "use strict";

  // require('clear');
  require('parallel')([
    // Initialize the subsystems in parallel for fast boot
    require('prefs').init,
    require('js-git/mixins/indexed-db').init
  ], function () {
    // Load the main GUI components
    require('tree');
    require('editor');
    require('slider');
    require('global-keys');
  });
});
