"use strict";

var CodeMirror = require('codemirror/lib/codemirror');
require("codemirror/addon/edit/closebrackets");
require("codemirror/addon/comment/comment");
require("codemirror/keymap/sublime");
require('jackl-mode');
require('jon-mode');

module.exports = CodeMirrorEditor;

function CodeMirrorEditor(emit) {
  var id;
  var code, mode, theme;
  var el;
  var cm = new CodeMirror(function (root) {
    el = root;
  }, {
    keyMap: "sublime",
    // lineNumbers: true,
    rulers: [{ column: 80 }],
    autoCloseBrackets: true,
    matchBrackets: true,
    showCursorWhenSelecting: true,
    styleActiveLine: true,
  });
  setTimeout(function () {
    cm.refresh();
  }, 0);

  cm.on("focus", function () {
    emit("focus", id);
  });

  return { render: render };

  function render(isDark, props) {
    id = props.id;
    var newTheme = isDark ? "notebook-dark" : "notebook";
    if (newTheme !== theme) {
      theme = newTheme;
      cm.setOption("theme", theme);
    }
    if (props.mode !== mode) {
      mode = props.mode;
      cm.setOption("mode", mode);
    }
    if (props.code !== code) {
      code = props.code;
      cm.setValue(code);
    }
    if (props.focused && !cm.hasFocus()) {
      cm.focus();
    }
    return el;
  }
}
