"use strict";

// require('clear');
require('./lib/parallel.js')([
  // Initialize the subsystems in parallel for fast boot
  require('./ui/prefs.js').init,
  require('./js-git/mixins/indexed-db.js').init
], function () {
  // Load the main GUI components
  require('./ui/tree.js');
  require('./ui/editor.js');
  require('./ui/slider.js');
  require('./ui/global-keys.js');
});
