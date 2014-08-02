var mine = require('mine');
var fs = require('data/fs');
var bodec = require('bodec');

exports.menuItem = {
  icon: "cog",
  label: "Run in Worker",
  combo: 1,    //Control
  keyCode: 13, // Enter
  action: execFile
};

var editor = require('ui/editor');
var tree = require('ui/tree');
var config = window.ace.require('ace/config');
var urls = {};

function jsToUrl(path, js) {
  var url = urls[path];
  if (url) window.URL.revokeObjectURL(url);
  var blob = new Blob([js], { type: "application/javascript" });
  return (urls[path] = window.URL.createObjectURL(blob));
}


var requireJs = "\n" + (function require(url) {
  /*global self*/
  "use strict";
  if (!require.cache) {
    require.id = 0;
    require.callbacks = {};
    self.onmessage = function (evt) {
      var message = JSON.parse(evt.data);
      var callback = require.callbacks[message.id];
      delete require.callbacks[message.id];
      callback(message.error, message.result);
    };
    require.cache = {fs: {exports: {
      readFile: function readFile(path, callback) {
        if (!callback) return readFile.bind(null, path);
        var id = require.id++;
        self.postMessage(JSON.stringify({id:id,path:path}));
        require.callbacks[id] = callback;
      }
    }}};
    require.aliases = {
      "gen-run": "https://raw.githubusercontent.com/creationix/gen-run/master/run.js",
      "bodec": "https://raw.githubusercontent.com/creationix/bodec/master/bodec.js",
    };
  }
  if (require.aliases[url]) url = require.aliases[url];
  var module = require.cache[url];
  if (module) return module.exports;
  module = self.module = require.cache[url] = { exports: {} };
  self.importScripts(url);
  return module.exports;
}).toString();


function execFile(row) {
  tree.activateDoc(row, true, function () {
    var js = editor.getText();
    js += requireJs;
    var blobURL = jsToUrl(row.path, js);
    var worker = new Worker(blobURL);
    worker.onmessage = function (evt) {
      var message = JSON.parse(evt.data);
      fs.readBlob(message.path, function (error, result) {
        if (result && result.blob) result = bodec.toUnicode(result.blob);
        worker.postMessage(JSON.stringify({
          id: message.id,
          error: error,
          result: result
        }));
      });
    };
    worker.onerror = function (error) {
      var row = error.lineno - 1;
      var column = error.colno - 1;
      editor.moveCursorTo(row, column);
      editor.getSession().setAnnotations([{
        row: row,
        column: column,
        text: error.message,
        type: "error"
      }]);
      config.loadModule("ace/ext/error_marker", function(module) {
        module.showErrorMarker(editor, 1);
      });
    };
  });
}
