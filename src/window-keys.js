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
    if (evt.keyCode === 48) { // "+"
      index = zooms.indexOf(100);
    }
    else if (evt.keyCode === 187) { // "+"
      if (index < zooms.length - 1) index++;
    }
    else if (evt.keyCode === 189) { // "-"
      if (index > 0) index--;
    }
    else if (evt.keyCode === 82 && evt.shiftKey) { // "r"
      chrome.runtime.reload();
    }
    else {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    prefs.set("zoomIndex", index);
    zoom();
  }, true);

  function zoom() {
    var size = original * zooms[index] / 100;
    if (oldSize !== undefined) {
      if (size === oldSize) return;
      slider.size = Math.round(slider.size / oldSize * size);
    }
    editor.setFontSize(size);
    document.body.style.fontSize = size + "px";
    oldSize = size;
  }
});
