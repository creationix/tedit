/*global ace*/
var editor = ace.edit("editor");
editor.setTheme("ace/theme/ambiance");
editor.getSession().setMode("ace/mode/jack");

console.log(ace.require)