var prefs = require('prefs');

exports.createRepo = function (config) {
  var repo = {};
  if (!config.prefix) {
    config.prefix = Date.now().toString(36) + "-" + (Math.random() * 0x100000000).toString(36);
    prefs.save();
  }
  require('js-git/mixins/indexed-db')(repo, config.prefix);
  prefs.save();

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
