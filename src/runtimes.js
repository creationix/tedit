define("runtimes.js", ["runtimes/local-export.js","runtimes/local-exec.js"], function (module, exports) { module.exports = [
  require('runtimes/local-export.js'),
  require('runtimes/local-exec.js'),
];

});
