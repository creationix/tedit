/*global define, ace*/
define(function () {
  "use strict";

  var $ = require('elements');
  // Put sample content and liven the editor
  var editor = ace.edit($.editor);
  editor.setValue('vars foo\nfoo = {items|\n  vars x\n  x = "All this is syntax highlighted";\n}\n', 0);
  editor.setTheme("ace/theme/ambiance");
  editor.setShowInvisibles(true);
  var session = editor.getSession();
  session.setMode("ace/mode/jack");
  session.setTabSize(2);

  return editor;
});
