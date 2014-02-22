"use strict";

require('carallel')([
  // Initialize the subsystems in parallel for fast boot
  require('data/prefs').init,
  require('js-git/mixins/indexed-db').init
], function () {
  // Load the main GUI components
  require('ui/tree-6');
  // require('ui/tree');
  require('ui/editor');
  require('ui/slider');
  require('ui/global-keys');
});
