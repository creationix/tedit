/*global define, chrome*/
define("ui/global-keys", function () {
  "use strict";

  var zoom = require('ui/zoom');
  var editor = require('ui/editor');

  window.addEventListener("keydown", onKey, true);
  function onKey(evt) {
    // Ctrl-0
    if (evt.ctrlKey && !evt.shiftKey && evt.keyCode === 48) zoom.reset();
    // Ctrl-"+"
    else if (evt.ctrlKey && !evt.shiftKey && evt.keyCode === 187) zoom.bigger();
    // Ctrl-"-"
    else if (evt.ctrlKey && !evt.shiftKey && evt.keyCode === 189) zoom.smaller();
    // Ctrl-Shift-R
    else if (evt.ctrlKey && evt.shiftKey && evt.keyCode === 82) chrome.runtime.reload();
    else if (evt.ctrlKey && evt.keyCode === 66) {
      // Ctrl-Shift-B
      if (evt.shiftKey) editor.prevTheme();
      // Ctrl-B
      else editor.nextTheme();
    }
    else return;
    evt.preventDefault();
    evt.stopPropagation();
  }

});
