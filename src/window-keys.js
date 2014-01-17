/*global define, chrome*/
define("window-keys", function () {
  "use strict";

  var prefs = require('prefs');
  var editor = require('editor');
  var tree = require('tree');
  var slider = require('slider');
  var zooms = [
    25, 33, 50, 67, 75, 90, 100, 110, 120, 125, 150, 175, 200, 250, 300, 400, 500
  ];
  var original = 16;
  var index = prefs.get("zoomIndex", zooms.indexOf(100));
  var oldSize;
  var oldSlider;
  zoom();

  window.addEventListener("keydown", function (evt) {
    // Ctrl-T
    if (evt.altKey && evt.keyCode === 84) toggle();
    // Ctrl-0
    else if (evt.ctrlKey && evt.keyCode === 48) reset();
    // Ctrl-"+"
    else if (evt.ctrlKey && evt.keyCode === 187) bigger();
    // Ctrl-"-"
    else if (evt.ctrlKey && evt.keyCode === 189) smaller();
    // Ctrl-Shift-R
    else if (evt.ctrlKey && evt.shiftKey && evt.keyCode === 82) chrome.runtime.reload();
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

  function toggle() {
    if (slider.size) hide();
    else show();
  }

  function hide() {
    oldSlider = slider.size;
    slider.size = 0;
    editor.focus();
  }

  function show() {
    slider.size = oldSlider || 200;
    tree.focus();
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
    reset: reset,
    toggle: toggle,
    show: show,
    hide: hide
  };
});
