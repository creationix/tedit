"use strict";
var backends = require('backends');

// Initialize the subsystems in parallel for fast boot
var setup = backends.map(function (backend) {
  return backend.init;
}).filter(Boolean);

require('carallel')(setup, function (err) {
  if (err) throw err;
  // Load the main GUI components
  require('ui/editor');
  require('ui/slider');
  require('ui/global-keys');
});

require('regenerator');