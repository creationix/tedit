"use strict";
var backends = require('./backends.js');

// Initialize the subsystems in parallel for fast boot
var setup = backends.map(function (backend) {
  return backend.init;
}).filter(Boolean);

require('carallel')(setup, function (err) {
  if (err) throw err;
  // Load the main GUI components
  require('./ui/editor.js');
  require('./ui/slider.js');
  require('./ui/global-keys.js');
});

// Reload the page when appcache detects an update.
window.addEventListener("load", function () {
  window.applicationCache.addEventListener('updateready', function() {
    if (window.applicationCache.status == window.applicationCache.UPDATEREADY) {
      window.location.reload();
    }
  }, false);
}, false);
