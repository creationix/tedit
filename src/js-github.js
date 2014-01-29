/*global define*/
define("js-github", function () {

  var normalizeAs = require('encoders').normalizeAs;
  var hashAs = require('encoders').hashAs;
  var decoders = require('github-decoders');
  var encoders = require('github-encoders');
  var xhr = require('xhr');

  // Implement the js-git object interface using github APIs
  return function (repo, root, accessToken) {

    repo.typeCache = {};
    repo.pendingReqs = {};

    repo.loadAs = loadAs; // (type, hash-ish) -> value
    repo.saveAs = saveAs; // (type, value) -> hash
    repo.readRef = readRef;
    repo.updateRef = updateRef;

    repo.apiRequest = xhr(root, accessToken);

  };

  function loadAs(type, hash, callback) {
    if (!callback) return loadAs.bind(this, type, hash);
    var repo = this;
    if (hash in repo.pendingReqs) {
      return repo.pendingReqs[hash].push(callback);
    }
    repo.pendingReqs[hash] = [callback];
    callback = flusher(repo.pendingReqs, hash);
    var typeName = type === "text" ? "blob" : type;
    repo.apiRequest("GET", "/repos/:root/git/" + typeName + "s/" + hash, onValue);

    function onValue(err, result) {
      if (result === undefined) return callback(err);
      repo.typeCache[hash] = type;
      var body;
      try {
        body = decoders[type].call(repo, result);
      }
      catch (err) {
        return callback(err);
      }
      return callback(null, body, hash);
    }
  }

  function flusher(hash, key) {
    return function () {
      var list = hash[key];
      delete hash[key];
      for (var i = 0, l = list.length; i < l; i++) {
        list[i].apply(this, arguments);
      }
    };
  }

  function saveAs(type, body, callback) {
    if (!callback) return saveAs.bind(this, type, body);
    var request;
    try {
      body = normalizeAs(type, body);
      request = encoders[type](body);
    }
    catch (err) {
      return callback(err);
    }

    // Github doesn't allow creating empty trees.
    if (type === "tree" && request.tree.length === 0) {
      return callback(null, hashAs("tree", []), body);
    }
    var typeCache = this.typeCache;
    var typeName = type === "text" ? "blobs" : type + "s";
    return this.apiRequest("POST", "/repos/:root/git/" + typeName, request, onWrite);

    function onWrite(err, result) {
      if (err) return callback(err);
      typeCache[result.sha] = type;
      return callback(null, result.sha, body);
    }
  }

  function readRef(ref, callback) {
    if (!callback) return readRef.bind(this, ref);
    if (!(/^refs\//).test(ref)) {
      return callback(new TypeError("Invalid ref: " + ref));
    }
    var typeCache = this.typeCache;
    return this.apiRequest("GET", "/repos/:root/git/" + ref, onRef);

    function onRef(err, result) {
      if (result === undefined) return callback(err);
      typeCache[result.object.sha] = result.object.type;
      return callback(null, result.object.sha);
    }
  }

  function updateRef(ref, hash, callback) {
    if (!callback) return updateRef(this, ref, hash);
    if (!(/^refs\//).test(ref)) {
      return callback(new Error("Invalid ref: " + ref));
    }
    var typeCache = this.typeCache;
    return this.apiRequest("PATCH", "/repos/:root/git/" + ref, {
      sha: hash,
      force: true
    }, onResult);

    function onResult(err, result) {
      if (err) return callback(err);
      typeCache[result.object.sha] = result.object.type;
      callback();
    }
  }


});
