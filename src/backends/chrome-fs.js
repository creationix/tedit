define("backends/chrome-fs.js", ["js-git/lib/modes.js","data/fs.js","ui/tree.js","git-chrome-fs/mixins/fs-db.js","backends/repo-common.js"], function (module, exports) { var modes = require('js-git/lib/modes.js');
var chrome = window.chrome;

exports.menuItem = {
  icon: "git",
  label: "Mount Local Repo",
  action: mountBareRepo
};

function mountBareRepo(row) {
  var fs = require('data/fs.js');
  chrome.fileSystem.chooseEntry({ type: "openDirectory"}, function (dir) {
    if (!dir) return;
    var name = dir.name;
    dir.getDirectory(".git", {}, function (result) {
      dir = result;
      go();
    }, go);
    function go() {
      require('ui/tree.js').makeUnique(row, name, modes.commit, function (path) {
        var entry = chrome.fileSystem.retainEntry(dir);
        row.call(path, fs.addRepo, { entry: entry });
      });
    }
  });
}

exports.createRepo = function (config) {
  if (!config.entry) return;
  var repo = {};

  require('git-chrome-fs/mixins/fs-db.js')(repo, config.entry);

  require('backends/repo-common.js')(repo);

  return repo;
};

});
