/*global define*/
define("paths", function () {

  var modes = require('modes');
  var inner, outer;

  makeRepo(onInner);
  makeRepo(onOuter);

  function onInner(err, repo) {
    if (err) throw err;
    inner = repo;
    repo.saveAs("blob", "Hello World\n", onInnerBlob);
  }

  function onInnerBlob(err, hash) {
    if (err) throw err;
    inner.saveAs("tree", {
      "test.txt": { mode: modes.blob, hash: hash }
    }, onInnerTree);
  }

  function onInnerTree(err, hash) {
    if (err) throw err;
    inner.saveAs("commit", {
      tree: hash,
      author: {
        name: "Tim Caswell",
        email: "tim@creationix.com"
      },
      message: "Text commit in inner repo"
    }, onInnerCommit);
  }

  function onInnerCommit(err, hash) {
    if (err) throw err;
    outer.submodules.inner = inner;
    // WARNING:  There is a race condition where we assume outer is ready by now.
    // If this ever becomes a problem, please add more code to protect.
    outer.saveAs("tree", {
      inner: { mode: modes.commit, hash: hash }
    }, onOuterTree);
  }

  function onOuter(err, repo) {
    if (err) throw err;
    outer = repo;
  }

  function onOuterTree(err, hash) {
    if (err) throw err;
    outer.pathToEntry(hash, "inner/test.txt", onEntry);
  }

  function onEntry(err, entry) {
    if (err) throw err;
    console.log("entry", entry);
  }

  function makeRepo(callback) {
    var repo = {};
    require('pathtoentry')(repo);
    require('indexeddb')(repo, function (err) {
      if (err) return callback(err);
      callback(null, repo);
    });
  }

});