define("backends/repo-common.js", ["js-git/mixins/create-tree.js","js-git/mixins/mem-cache.js","js-git/mixins/read-combiner.js","js-git/mixins/walkers.js","js-git/mixins/formats.js"], function (module, exports) { module.exports = function (repo) {
  require('js-git/mixins/create-tree.js')(repo);

  // Cache everything except blobs over 100 bytes in memory.
  require('js-git/mixins/mem-cache.js')(repo);

  // Combine concurrent read requests for the same hash
  require('js-git/mixins/read-combiner.js')(repo);

  require('js-git/mixins/walkers.js')(repo);

  // Add in value formatting niceties.  Also adds text and array types.
  require('js-git/mixins/formats.js')(repo);
};

});
