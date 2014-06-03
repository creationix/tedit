
exports.menuItem = {
  icon: "asterisk",
  label: "Eval in Main",
  action: execFile
};

var bodec = require('bodec');
var modes = require('js-git/lib/modes');
var fs = require('data/fs');

function execFile(row) {
  row.call(fs.readBlob, function (file) {
    if (!/\.js$/.test(row.path) || !modes.isFile(file.mode)) {
      return;
    }
    var js = bodec.toUnicode(file.blob);
    eval(js);
  });
}
