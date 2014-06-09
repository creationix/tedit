"use strict";
var forge = window.forge;//require('forge');
var bodec = require('bodec');
var defer = require('js-git/lib/defer');
var prefs = require('prefs');

module.exports = function (storage, passphrase) {

  require('js-git/mixins/path-to-entry')(storage);
  require('js-git/mixins/mem-cache')(storage);
  require('js-git/mixins/create-tree')(storage);
  require('js-git/mixins/formats')(storage);

  // Derive a 32 bit key from the passphrase
  var key = forge.pkcs5.pbkdf2(passphrase, 'kodeforkids', 16000, 32);

  var repo = {};
  var fs = require('js-git/lib/git-fs')(storage, {
    shouldEncrypt: function (path) {
      // We only want to encrypt the actual blobs
      // Everything else can be plaintext.
      return path.split("/").filter(Boolean)[0] === "objects";
    },
    encrypt: function (plain) {
      var iv = forge.random.getBytesSync(16);
      var cipher = forge.cipher.createCipher('AES-CBC', key);
      cipher.start({iv: iv});
      var raw = bodec.toRaw(plain);
      cipher.update(forge.util.createBuffer(raw));
      cipher.finish();
      var encrypted = cipher.output.bytes();
      return bodec.fromRaw(iv + encrypted);
    },
    decrypt: function (encrypted) {
      var decipher = forge.cipher.createDecipher('AES-CBC', key);
      var iv = bodec.toRaw(encrypted, 0, 16);
      encrypted = bodec.toRaw(encrypted, 16);
      decipher.start({iv: iv});
      decipher.update(forge.util.createBuffer(encrypted));
      decipher.finish();
      return bodec.fromRaw(decipher.output.bytes());
    },
    getRootTree: function (callback) {

      if (rootTree) {
        callback(null, rootTree);
        callback = null;
        if (Date.now() - rootTime < 1000) return;
      }
      storage.readRef("refs/heads/master", function (err, hash) {
        if (!hash) return callback(err);
        storage.loadAs("commit", hash, function (err, commit) {
          if (!commit) return callback(err);
          rootTree = commit.tree;
          rootTime = Date.now();
          if (callback) callback(null, commit.tree);
        });
      });
    },
    setRootTree: function (hash, callback) {
      rootTree = hash;
      rootTime = Date.now();
      defer(saveRoot);
      callback();
    }
  });

  var rootTree;
  var rootTime;
  var saving, savedRoot;
  function saveRoot() {
    if (saving || savedRoot === rootTree) return;
    saving = rootTree;
    storage.saveAs("commit", {
      tree: rootTree,
      author: {
        name: prefs.get("userName", "JS-Git"),
        email: prefs.get("userEmail", "js-git@creationix.com")
      },
      message: "Auto commit to update fs image"
    }, function (err, hash) {
      if (!hash) return onDone(err);
      storage.updateRef("refs/heads/master", hash, function (err) {
        onDone(err);
      }, true);

      function onDone(err) {
        if (!err) savedRoot = saving;
        saving = false;
        if (err) throw err;
      }
    });
  }

  require('js-git/mixins/fs-db')(repo, fs);

  return repo;

};