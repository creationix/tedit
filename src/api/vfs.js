var pathjoin = require('pathjoin');
var fs = require('data/fs');

// Wrapper around tedit's private APIs to provide access to the vfs.
exports = module.exports = relative;
exports.readFile = readFile;

function relative(dirname) {
  return {
    readFile: readFileRelative
  };

  function* readFileRelative(path) {
    if (path[0] === ".") path = pathjoin(dirname, path);
    return yield* readFile(path);
  }
}

function* readFile(path) {
  var entry = yield fs.readEntry(path);
  var repo = fs.findRepo(entry.root);
  return yield repo.loadAs("text", entry.hash);
}