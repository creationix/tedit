/*global define*/
define("main", function () {
  "use strict";

  // require('clear');
  require('lib/parallel')([
    // Initialize the subsystems in parallel for fast boot
    require('ui/prefs').init,
    require('js-git/mixins/indexed-db').init
  ], function () {
    // Load the main GUI components
    require('ui/tree');
    require('ui/editor');
    require('ui/slider');
    require('ui/global-keys');
  });
});
