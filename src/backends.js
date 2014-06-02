define("backends.js", ["backends/github.js","backends/indexed-db.js","backends/websql.js"], function (module, exports) { var backends = module.exports = [];
backends.push(require('backends/github.js'));
if (window.indexedDB) {
  backends.push(require('backends/indexed-db.js'));
}
else if (window.openDatabase) {
  backends.push(require('backends/websql.js'));
}
else if (window.localStorage) {
  // backends.push(require('backends/local-storage'));
// }
// else {
  console.warn("No persistance can be used on this platform");
  // backends.push(require('backends/mem-storage'));
}

});
