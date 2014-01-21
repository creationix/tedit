/*global define, indexedDB*/
define("indexeddb", function () {
  "use strict";

  var encoders = require('encoders');
  var binary = require('binary');

  var db = null;
  var callbacks = [];
  var request = indexedDB.open("tedit", 1);

  // We can only create Object stores in a versionchange transaction.
  request.onupgradeneeded = function(evt) {
    var db = evt.target.result;

    // A versionchange transaction is started automatically.
    evt.target.transaction.onerror = onError;

    if(db.objectStoreNames.contains("objects")) {
      db.deleteObjectStore("objects");
    }

    db.createObjectStore("objects", {keyPath: "hash"});
  };

  request.onsuccess = function (evt) {
    db = evt.target.result;
    callbacks.forEach(function (callback) {
      callback(db);
    });
    callbacks = null;
  };
  request.onerror = onError;

  return mixin;

  function mixin(repo, callback) {
    repo.saveAs = saveAs;
    repo.loadAs = loadAs;
    if (!callback) return;
    if (db) return callback(db);
    callbacks.push(callback);
  }

  function onError(evt) {
    console.error(evt.target.error);
  }

  function saveAs(type, body, callback) {
    var hash;
    try {
      body = encoders.normalizeAs(type, body);
      hash = encoders.hashAs(type, body);
    }
    catch (err) { return callback(err); }
    var trans = db.transaction(["objects"], "readwrite");
    var store = trans.objectStore("objects");
    var entry = { hash: hash, type: type, body: body };
    var request = store.put(entry);
    request.onsuccess = function() {
      callback(null, hash);
    };
    request.onerror = function(evt) {
      callback(new Error(evt.value));
    };
  }

  function loadAs(type, hash, callback) {
    var trans = db.transaction(["objects"], "readwrite");
    var store = trans.objectStore("objects");
    var request = store.get(hash);
    request.onsuccess = function(evt) {
      var entry = evt.target.result;
      if (type === "text") {
        type = "blob";
        entry.body = binary.toUnicode(entry.body);
      }
      if (type !== entry.type) {
        return callback(new TypeError("Type mismatch"));
      }
      callback(null, entry.body);
    };
    request.onerror = function(evt) {
      callback(new Error(evt.value));
    };
  }

});
