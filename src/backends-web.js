var backends = module.exports = [];
backends.push(require('backends/github'));
if (window.indexedDB) {
  backends.push(require('backends/indexed-db'));
}
else if (window.openDatabase) {
  backends.push(require('backends/websql'));
}
else if (window.localStorage) {
  // backends.push(require('backends/local-storage'));
// }
// else {
  console.warn("No persistance can be used on this platform");
  // backends.push(require('backends/mem-storage'));
}
