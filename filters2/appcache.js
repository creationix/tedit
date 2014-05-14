"use strict";

var sha1 = require('git-sha1');
var pathJoin = require('pathjoin');
var carallel = require('carallel');
var modes = require('js-git/lib/modes');
var bodec = require('bodec');

var mime = "text/cache-manifest";

module.exports = appcache;

function appcache(servePath, req, callback) {

  var actions = req.cache.map(function (file) {
    return function (callback) {
      servePath(pathJoin(req.paths.rule, "..", file), callback);
    };
  });

  carallel(actions, function (err, entries) {
    if (err) return callback(err);
    var manifest = "CACHE MANIFEST\n";
    entries.forEach(function(entry, i) {
      if (entry.hash) {
        manifest += req.cache[i] + "#" + entry.hash + "\n";
      }
      else {
        manifest += req.cache[i] + "\n";
      }
    });
    if (req.network) {
      manifest += "\nNETWORK:\n" + req.network.join("\n") + "\n";
    }
    if (req.fallback) {
      manifest += "\nFALLBACK:\n";
      manifest += Object.keys(req.fallback).map(function (key) {
        return key + " " + req.fallback[key];
      }).join("\n") + "\n";
    }
    var hash = sha1(manifest);
    callback(null, {
      mode: modes.file,
      hash: hash,
      mime: mime,
      fetch: fetch
    });

    function fetch(callback) {
      callback(null, bodec.fromUnicode(manifest));
    }
  });

}
