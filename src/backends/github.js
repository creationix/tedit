var prefs = require('prefs');

exports.createRepo = function (config) {
  if (!config.github) return;
  var repo = {};
  if (!config.url) throw new Error("Missing url in github config");
  var githubName = getGithubName(config.url);
  var githubToken = prefs.get("githubToken", "");
  if (!githubToken) throw new Error("Missing github access token");
  require('js-github/mixins/github-db')(repo, githubName, githubToken);
  // Cache github objects locally in indexeddb
  require('js-git/mixins/add-cache')(repo, require('js-git/mixins/indexed-db'));

  // Github has this built-in, but it's currently very buggy
  require('js-git/mixins/create-tree')(repo);

  // require('js-git/mixins/delay')(repo, 200);

  // Cache everything except blobs over 100 bytes in memory.
  require('js-git/mixins/mem-cache')(repo);

  // Combine concurrent read requests for the same hash
  require('js-git/mixins/read-combiner')(repo);

  // Add in value formatting niceties.  Also adds text and array types.
  require('js-git/mixins/formats')(repo);

  return repo;
};

function getGithubName(url) {
  var match = url.match(/github.com[:\/](.*?)(?:\.git)?$/);
  if (!match) throw new Error("Url is not github repo: " + url);
  return match[1];
}
