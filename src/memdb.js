/*global define*/
define("memdb", function () {
  "use strict";

  var defer = require('defer');
  var encoders = require('encoders');
  var binary = require('binary');

  var objects = mixin.objects = {};
  var types = mixin.types = {};

  return mixin;

  function mixin(repo) {
    repo.saveAs = saveAs;
    repo.loadAs = loadAs;
  }

  function saveAs(type, body, callback) {
    defer(function () {
      var hash;
      try {
        body = encoders.normalizeAs(type, body);
        hash = encoders.hashAs(type, body);
      }
      catch (err) { return callback(err); }
      objects[hash] = body;
      types[hash] = type;
      callback(null, hash);
    });
  }

  function loadAs(type, hash, callback) {
    defer(function () {
      var realType = (type === "text" || type === "raw") ? "blob" : type;
      if (!types[hash]) return callback();
      if (realType !== types[hash]) return callback(new TypeError("Type mismatch"));
      var result = objects[hash];
      if (type === "text") result = binary.decodeUtf8(result);
      if (type === "blob") result = binary.fromRaw(result);
      callback(null, result);
    });
  }

});
