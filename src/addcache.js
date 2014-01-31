/*global define*/
define("addcache", function () {

  var hashAs = require('encoders').hashAs;

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
          if (type === "commit" || type === "tag") {
            fixDate(type, value, hash);
          }
          if (type === "text") type = "blob";
          cache.saveAs(type, value, function (err, cacheHash) {
            if (err) return callback(err);
            if (hash !== cacheHash) return callback(new Error("hash mismatch"));
            callback(null, value, hash);
          });
        });
      });
    }

    function saveAsCached(type, value, callback) {
      saveAs.call(repo, type, value, function (err, hash) {
        if (err) return callback(err);
        if (type === "commit" || type === "tag") {
          fixDate(type, value, hash);
        }
        cache.saveAs(type, value, function (err, hash, value) {
          if (err) return callback(err);
          callback(null, hash, value);
        });
      });
    }
  }

  function fixDate(type, value, hash) {
    for (var offset = -720; offset < 720; offset += 30) {
      if (type === "commit") {
        value.author.date.timeZoneOffset = offset;
        value.committer.date.timeZoneOffset = offset;
      }
      else if (type === "tag") {
        value.tagger.date.timeZoneOffset = offset;
      }
      var testHash = hashAs(type, value);
      if (testHash === hash) {
        console.log("TIME FIXED", offset)
        return;
      }
    }
    console.error("UNABLE TO GUESS TIMEZONE")
  }
});
