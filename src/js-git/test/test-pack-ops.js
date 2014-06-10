define("js-git/test/test-pack-ops.js", ["js-git/test/run.js","js-git/mixins/mem-db.js","js-git/test/sample-pack.js","js-git/mixins/pack-ops.js"], function (module, exports) { var run = require('js-git/test/run.js');

var repo = {};
require('js-git/mixins/mem-db.js')(repo);

var pack = require('js-git/test/sample-pack.js');
var hashes;

run([
  function setup() {
    require('js-git/mixins/pack-ops.js')(repo);
  },
  function testUnpack(end) {
    repo.unpack(singleStream(pack), {
      onProgress: onProgress
    }, function (err, result) {
      if (err) return end(err);
      hashes = result;
      if (hashes.length !== 16) {
        return end(new Error("Wrong number of objects unpacked"));
      }
      end();
    });
    function onProgress(progress) {
      // console.log(progress);
    }
  },
  function testPack(end) {
    var stream;
    var parts = [];
    repo.pack(hashes, {}, function (err, result) {
      if (err) return end(err);
      stream = result;
      stream.read(onRead);
    });
    function onRead(err, chunk) {
      if (err) return end(err);
      // console.log(chunk);
      if (chunk) {
        parts.push(chunk);
        return stream.read(onRead);
      }
      end();
    }
  }
]);

function singleStream(item) {
  var done = false;
  return { read: function (callback) {
    if (done) return callback();
    done = true;
    callback(null, item);
  }};
}
});
