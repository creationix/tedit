/*global define, chrome*/
define("zoom", function () {
  "use strict";

  var prefs = require('prefs');
  var zooms = [
    25, 33, 50, 67, 75, 90, 100, 110, 120, 125, 150, 175, 200, 250, 300, 400, 500
  ];
  var index = prefs.get("zoomIndex", zooms.indexOf(100));
  var oldIndex = index;
  var handlers = [];

  window.addEventListener("keydown", onKey, true);

  onZoom.bigger = bigger;
  onZoom.smaller = smaller;
  onZoom.reset = reset;
  return onZoom;

  function onZoom(callback) {
    handlers.push(callback);
    callback(zooms[index] / 100, zooms[oldIndex] / 100);
  }

  function onKey(evt) {
    // Ctrl-0
    if (evt.ctrlKey && evt.keyCode === 48) reset();
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
  }

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
    if (index === oldIndex) return;
    var scale = zooms[index] / 100;
    var oldScale = oldIndex && zooms[oldIndex] / 100;
    oldIndex = index;
    handlers.forEach(function (handler) {
      handler(scale, oldScale);
    });
    prefs.set("zoomIndex", index);
  }

});
