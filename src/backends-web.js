exports.github = require('backends/github')
if (window.indexedDB) {
  exports.idb = require('backends/indexed-db');
}
// if (window.openDatabase) {
//   exports.sql = require('backends/websql');
// }
// if (window.localStorage) {
//   exports.local = require('backends/local-storage');
// }
