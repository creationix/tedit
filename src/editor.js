/*global define, ace*/
define("editor", ["elements"], function ($) {
  // Put sample content and liven the editor
  $.editor.textContent = 'vars foo\nfoo = {items|\n  vars x\n  x = "All this is syntax highlighted";\n}\n';
  var editor = ace.edit($.editor);
  editor.setTheme("ace/theme/ambiance");
  editor.getSession().setMode("ace/mode/jack");
});
