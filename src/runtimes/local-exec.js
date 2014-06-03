
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

function execFile(row) {
  tree.activateDoc(row, true, function () {
    var js = editor.getText();
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
