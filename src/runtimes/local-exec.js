
exports.menuItem = {
  icon: "cog",
  label: "Execute File",
  combo: 1,    //Control
  keyCode: 13, // Enter
  action: execFile
};

var bodec = require('bodec');
var modes = require('js-git/lib/modes');
var fs = require('data/fs');
var editor = require('ui/editor');
var config = window.ace.require('ace/config');

function execFile(row) {
  row.call(fs.readBlob, function (file) {
    if (!/\.js$/.test(row.path) || !modes.isFile(file.mode)) {
      return;
    }
    var js = bodec.toUnicode(file.blob);
    var blob = new Blob([js], { type: "application/javascript" });
    var blobURL = window.URL.createObjectURL(blob);
    var worker = new Worker(blobURL);
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
    // window.URL.revokeObjectURL(blobURL);
  });
}
