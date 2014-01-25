/*global define*/
define("memdb", function () {
  "use strict";

  var defer = require('defer');
  var encoders = require('encoders');
  var binary = require('binary');
  var i = 0;

  return mixin;

  function mixin(repo) {
    var objects = repo.objects = {};
    var name = i++;
    var types = {};

    repo.saveAs = saveAs;
    repo.loadAs = loadAs;

    function saveAs(type, body, callback) {
      defer(function () {
        var hash;
        try {
          body = encoders.normalizeAs(type, body);
          hash = encoders.hashAs(type, body);
        }
        catch (err) { return callback(err); }
        console.log("SAVE", name, hash);
        objects[hash] = body;
        types[hash] = type;
        callback(null, hash, body);
      });
    }

    function loadAs(type, hash, callback) {
      console.log("LOAD", name, hash);
      defer(function () {
        var realType = (type === "text" || type === "raw") ? "blob" : type;
        if (!types[hash]) return callback();
        if (realType !== types[hash]) return callback(new TypeError("Type mismatch"));
        var result = objects[hash];
        if (type === "text") result = binary.toUnicode(result);
        else if (type !== "blob") result = encoders.normalizeAs(type, result);
        callback(null, result, hash);
      });
    }

  }


});
