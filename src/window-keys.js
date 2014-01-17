/*global define, chrome*/
define("window-keys", function () {
  "use strict";

  var prefs = require('prefs');
  var editor = require('editor');
  var slider = require('slider');
  var zooms = [
    25, 33, 50, 67, 75, 90, 100, 110, 120, 125, 150, 175, 200, 250, 300, 400, 500
  ];
  var original = 16;
  var index = prefs.get("zoomIndex", zooms.indexOf(100));
  var oldSize;
  zoom();

  window.addEventListener("keydown", function (evt) {
    if (!evt.ctrlKey) return;
    // Ctrl-0
    if (evt.keyCode === 48) reset();
    // Ctrl-"+"
    else if (evt.keyCode === 187) bigger();
    // Ctrl-"-"
    else if (evt.keyCode === 189) smaller();
    // Ctrl-Shift-R
    else if (evt.keyCode === 82 && evt.shiftKey) chrome.runtime.reload();
    // Ignore and let rest of app handle it.
    else return;
    evt.preventDefault();
    evt.stopPropagation();
  }, true);

  function bigger() {
    if (index < zooms.length - 1) index++;
    zoom();
  }

  function smaller() {
    if (index > 0) index--;
    zoom();
  }

  function reset() {
    index = zooms.indexOf(100);
    zoom();
  }

  function zoom() {
    var size = original * zooms[index] / 100;
    if (oldSize !== undefined) {
      if (size === oldSize) return;
      slider.size = Math.round(slider.size / oldSize * size);
    }
    prefs.set("zoomIndex", index);
    editor.setFontSize(size);
    document.body.style.fontSize = size + "px";
    oldSize = size;
  }

  return {
    bigger: bigger,
    smaller: smaller,
    reset: reset
  };
});
