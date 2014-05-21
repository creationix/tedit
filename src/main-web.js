"use strict";

require('carallel')([
  // Initialize the subsystems in parallel for fast boot
  require('js-git/mixins/indexed-db').init
], function (err) {
  if (err) throw err;
  // Load the main GUI components
  require('ui/editor');
  require('ui/slider');
  require('ui/global-keys');
});
