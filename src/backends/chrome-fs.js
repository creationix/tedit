var modes = require('js-git/lib/modes');
var chrome = window.chrome;

exports.menuItem = {
  icon: "git",
  label: "Mount Local Repo",
  action: mountBareRepo
};

function mountBareRepo(row) {
  var fs = require('data/fs');
  chrome.fileSystem.chooseEntry({ type: "openDirectory"}, function (dir) {
    if (!dir) return;
    var name = dir.name;
    dir.getDirectory(".git", {}, function (result) {
      dir = result;
      go();
    }, go);
    function go() {
      require('ui/tree').makeUnique(row, name, modes.commit, function (path) {
        var entry = chrome.fileSystem.retainEntry(dir);
        row.call(path, fs.addRepo, { entry: entry });
      });
    }
  });
}

exports.createRepo = function (config) {
  if (!config.entry) return;
  var repo = {};

  require('git-chrome-fs/mixins/fs-db')(repo, config.entry);

  require('./repo-common')(repo);

  return repo;
};
