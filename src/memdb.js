/*global define*/
define("memdb", function () {
  "use strict";

  var defer = require('defer');
  var encoders = require('encoders');

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
      if (!types[hash]) return callback();
      if (type !== types[hash]) return callback(new TypeError("Type mismatch"));
      callback(null, objects[hash]);
    });
  }

});
