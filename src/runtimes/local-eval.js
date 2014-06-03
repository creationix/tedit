
exports.menuItem = {
  icon: "asterisk",
  label: "Eval in Main",
  action: execFile
};

var editor = require('ui/editor');

function execFile(row) {
  var js = editor.getText();
  (new Function(js))();
}
