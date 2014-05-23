var prefs = require('prefs');


exports.init = require('js-git/mixins/indexed-db').init;

exports.createRepo = function (config) {
  var repo = {};
  if (!config.prefix) {
    config.prefix = Date.now().toString(36) + "-" + (Math.random() * 0x100000000).toString(36);
    prefs.save();
  }
  require('js-git/mixins/indexed-db')(repo, config.prefix);
  prefs.save();

  require('./repo-common')(repo);

  return repo;
};
