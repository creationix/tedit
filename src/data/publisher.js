"use strict";

var binary = require('bodec');
var pathJoin = require('pathjoin');
var loadModule = require('./load-module');
var modes = require('js-git/lib/modes');

// readPath accepts a path and outputs {mode,hash,root,[mime],fetch}
module.exports = function (readPath, settings) {

  var codeHashes = {};
  var filters = {};


  return servePath;

  function servePath(path, callback) {
    if (!callback) return servePath.bind(null, path);
    // console.log("servePath", path);
    return readPath(path, bake, callback);
  }

  function bake(req, callback) {
    // console.log("BAKE", {
    //   req: req,
    //   settings: settings
    // });
    if (!settings.filters) {
      // TODO: serve rule file as static file.
      return callback(null, {mode:modes.file,hash:"TODO:servefile",fetch:function (callback) {
        callback(null, binary.fromUnicode("TODO:servefile"));
      }});
    }

    var codeHash;
    var codePath = pathJoin(settings.filters, req.program + ".js");
    return servePath(codePath, onCodeEntry);

    function onCodeEntry(err, entry) {
      if (err) return callback(err);
      if (!entry.hash) return callback(new Error("Missing filter " + req.name));
      req.codeHash = codeHash = entry.hash;
      // If the code hasn't changed, reuse the existing compiled worker.
      if (codeHashes[req.program] === codeHash) {
        return filters[req.program](servePath, req, callback);
      }
      return entry.fetch(onCode);
    }

    function onCode(err, blob) {
      if (err) return callback(err);
      var code;
      try { code = binary.toUnicode(blob); }
      catch (err) { return callback(err); }
      console.log("Compiling filter " + req.program);
      var module = loadModule(code);
      if (typeof module !== "function") {
        return callback(new Error(req.program + " exports was not a function"));
      }
      filters[req.program] = module;
      codeHashes[req.program] = codeHash;
      filters[req.program](servePath, req, callback);
    }
  }

};
