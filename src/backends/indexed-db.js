define("backends/indexed-db.js", ["prefs.js","js-git/mixins/indexed-db.js","js-git/mixins/indexed-db.js","backends/repo-common.js"], function (module, exports) { var prefs = require('prefs.js');


exports.init = require('js-git/mixins/indexed-db.js').init;

exports.createRepo = function (config) {
  var repo = {};
  if (!config.prefix) {
    config.prefix = Date.now().toString(36) + "-" + (Math.random() * 0x100000000).toString(36);
    prefs.save();
  }
  require('js-git/mixins/indexed-db.js')(repo, config.prefix);
  prefs.save();

  require('backends/repo-common.js')(repo);

  return repo;
};

});
