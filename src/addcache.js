/*global define*/
define("addcache", function () {

  return addCache;
  function addCache(repo, cache) {
    var loadAs = repo.loadAs;
    var saveAs = repo.saveAs;

    repo.loadAs = loadAsCached;
    repo.saveAs = saveAsCached;

    function loadAsCached(type, hash, callback) {
      if (!callback) return loadAsCached.bind(this, type, hash);
      cache.loadAs(type, hash, function (err, value) {
        if (err) return callback(err);
        if (value !== undefined) {
          return callback(null, value, hash);
        }
        loadAs.call(repo, type, hash, function (err, value) {
          if (err) return callback(err);
          else if (type === "text") type = "blob";
          cache.saveAs(type, value, function (err) {
            if (err) return callback(err);
            callback(null, value, hash);
          }, hash);
        });
      });
    }

    function saveAsCached(type, value, callback) {
      saveAs.call(repo, type, value, function (err, hash) {
        if (err) return callback(err);
        cache.saveAs(type, value, function (err, hash, value) {
          if (err) return callback(err);
          callback(null, hash, value);
        }, hash);
      });
    }
  }

});
