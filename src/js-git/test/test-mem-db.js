define("js-git/test/test-mem-db.js", ["js-git/test/run.js","bodec.js","git-sha1.js","js-git/lib/object-codec.js","js-git/mixins/mem-db.js"], function (module, exports) { var run = require('js-git/test/run.js');
var bodec = require('bodec.js');
var sha1 = require('git-sha1.js');
var codec = require('js-git/lib/object-codec.js');

var repo = {};
require('js-git/mixins/mem-db.js')(repo);

var blob = bodec.fromUnicode("Hello World\n");
var blobHash = "557db03de997c86a4a028e1ebd3a1ceb225be238";
run([
  function testSaveAs(end) {
    repo.saveAs("blob", blob, function (err, hash) {
      if (err) return end(err);
      if (hash !== blobHash) {
        console.log([hash, blobHash]);
        return end(new Error("Hash mismatch"));
      }
      end();
    });
  },
  function testLoadRaw(end) {
    repo.loadRaw(blobHash, function (err, bin) {
      if (err) return end(err);
      var obj = codec.deframe(bin, true);
      if (obj.type !== "blob") return err(new Error("Wrong type"));
      if (bodec.toUnicode(obj.body) !== bodec.toUnicode(blob)) {
        return err(new Error("Wrong body"));
      }
      end();
    });
  },
  function testLoadAs(end) {
    repo.loadAs("blob", blobHash, function (err, body) {
      if (err) return end(err);
      if (bodec.toUnicode(body) !== bodec.toUnicode(blob)) {
        return err(new Error("Wrong body"));
      }
      end();
    });
  },
  function testSaveRaw(end) {
    var newBody = bodec.fromUnicode("A new body\n");
    var bin = codec.frame({type:"blob",body:newBody});
    var hash = sha1(bin);
    repo.saveRaw(hash, bin, function (err) {
      if (err) return end(err);
      repo.loadAs("blob", hash, function (err, body) {
        if (err) return end(err);
        if (bodec.toUnicode(body) !== bodec.toUnicode(newBody)) {
          return end(new Error("Body mismatch"));
        }
        end();
      });
    });
  }
]);

});
