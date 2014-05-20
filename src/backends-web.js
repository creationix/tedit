var backends = module.exports = [];
backends.push(require('backends/github'));
if (window.indexedDB) {
  backends.push(require('backends/indexed-db'));
}
if (window.openDatabase) {
  backends.push(require('backends/websql'));
}
if (window.localStorage) {
  backends.push(require('backends/local-storage'));
}
