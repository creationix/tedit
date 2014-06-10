define("runtimes.js", ["runtimes/local-export.js","runtimes/local-exec.js","runtimes/local-eval.js"], function (module, exports) { module.exports = [
  require('runtimes/local-export.js'),
  require('runtimes/local-exec.js'),
  require('runtimes/local-eval.js'),
];

});
