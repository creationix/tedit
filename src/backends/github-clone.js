define("backends/github-clone.js", ["js-git/lib/modes.js","prefs.js","js-github/mixins/github-db.js","js-git/mixins/read-combiner.js","backends/encrypt-repo.js","js-git/mixins/indexed-db.js","js-git/mixins/sync.js","js-git/mixins/fall-through.js","backends/repo-common.js","prefs.js","ui/dialog.js","data/fs.js","ui/tree.js"], function (module, exports) { "use strict";

var modes = require('js-git/lib/modes.js');
var prefs = require('prefs.js');

exports.menuItem =  {
  icon: "download-cloud",
  label: "Clone Github Repo",
  action: addGithubClone
};

exports.createRepo = function (config) {
  if (!config.github) return;
  if (!config.url) throw new Error("Missing url in github config");
  var githubToken = prefs.get("githubToken", "");
  if (!githubToken) throw new Error("Missing github access token");
  var remote = {};
  var githubName = getGithubName(config.url);
  require('js-github/mixins/github-db.js')(remote, githubName, githubToken);
  require('js-git/mixins/read-combiner.js')(remote);

  if (config.passphrase) {
    remote = require('backends/encrypt-repo.js')(remote, config.passphrase);
  }

  var repo = {};
  if (!config.prefix) {
    config.prefix = Date.now().toString(36) + "-" + (Math.random() * 0x100000000).toString(36);
  }
  require('js-git/mixins/indexed-db.js')(repo, config.prefix);
  prefs.save();

  require('js-git/mixins/sync.js')(repo, remote);
  require('js-git/mixins/fall-through.js')(repo, remote);

  require('backends/repo-common.js')(repo);

  return repo;
};

function getGithubName(url) {
  var match = url.match(/github.com[:\/](.*?)(?:\.git)?$/);
  if (!match) throw new Error("Url is not github repo: " + url);
  return match[1];
}

function addGithubClone(row) {
  var prefs = require('prefs.js');
  var githubToken = prefs.get("githubToken", "");
  var dialog = require('ui/dialog.js');

  dialog.multiEntry("Mount Github Repo", [
    {name: "path", placeholder: "user/name", required:true},
    {name: "ref", placeholder: "refs/heads/master"},
    {name: "name", placeholder: "localname"},
    {name: "passphrase", placeholder: "encryption passphrase"},
    {name: "token", placeholder: "Enter github auth token", required:true, value: githubToken}
  ], function (result) {
    if (!result) return;
    if (result.token !== githubToken) {
      prefs.set("githubToken", result.token);
    }
    var url = result.path;
    // Assume github if user/name combo is given
    if (/^[^\/:@]+\/[^\/:@]+$/.test(url)) {
      url = "git@github.com:" + url + ".git";
    }
    var fs = require('data/fs.js');
    var name = result.name || result.path.match(/[^\/]*$/)[0];
    var ref = result.ref || "refs/heads/master";
    var config = {
      url: url,
      ref: ref,
      github: true
    };
    if (result.passphrase) config.passphrase = result.passphrase;
    require('ui/tree.js').makeUnique(row, name, modes.commit, function (path) {
      row.call(path, fs.addRepo, config);
    });
  });
}

});
