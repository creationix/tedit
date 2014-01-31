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
            // Guess timezone since GitHub forgot to tell us
            fixDate(type, value, hash);
          }
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
        if (type === "commit" || type === "tag") {
          // Guess timezone since GitHub forgot to tell us
          fixDate(type, value, hash);
        }
        cache.saveAs(type, value, function (err, hash, value) {
          if (err) return callback(err);
          callback(null, hash, value);
        });
      });
    }
  }

  // GitHub has a nasty habit of stripping whitespace from messages and loosing
  // the timezone.  Thies information is required to make our hashes match up, so
  // we guess it by mutating the value till the hash matches.
  function fixDate(type, value, hash) {
    // Add up to 2 extra newlines and try all 24 30-minutes timezone offsets.
    for (var x = 0; x < 3; x++) {
      for (var i = -720; i < 720; i += 30) {
        if (type === "commit") {
          value.author.date.timeZoneOffset = i;
          value.committer.date.timeZoneOffset = i;
        }
        else if (type === "tag") {
          value.tagger.date.timeZoneOffset = i;
        }
        if (hash === hashAs(type, value)) return;
      }
      value.message += "\n";
    }
    console.error("UNABLE TO FIX VALUE, FORCING HASH");
  }
});
