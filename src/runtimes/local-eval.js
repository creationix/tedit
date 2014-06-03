
exports.menuItem = {
  icon: "asterisk",
  label: "Eval in Main",
  action: execFile
};

var editor = require('ui/editor');
var tree = require('ui/tree');

function execFile(row) {
  tree.activateDoc(row, true, function () {
    var js = editor.getText();
    (new Function(js))();
  });
}
