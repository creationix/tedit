/*global define, chrome*/
define(function () {
  "use strict";

  var zooms = [
    25, 33, 50, 67, 75, 90, 100, 110, 120, 125, 150, 175, 200, 250, 300, 400, 500
  ];
  var original = 16;
  var index = zooms.indexOf(100);
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
    zoom();
  }, true);

  function zoom() {
    var size = original * zooms[index] / 100;
    document.body.style.fontSize = size + "px";
  }
});
