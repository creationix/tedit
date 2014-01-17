/*global define*/
define("slider", function () {
  "use strict";

  var $ = require("elements");
  var prefs = require('prefs');
  var position = null;
  var isTouch = false;
  var size = prefs.get("slider", 200);
  var width = 8;
  var innerWidth;

  onResize();
  slide(size);
  var gutter = document.querySelector(".ace_gutter");

  window.addEventListener("resize", onResize);
  gutter.addEventListener("mousedown", onStart, true);
  gutter.addEventListener("touchstart", onStart, true);

  function onResize() {
    innerWidth = window.innerWidth;
  }

  function onStart(evt) {
    if (position !== null) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.touches) {
      evt = evt.touches[0];
      isTouch = true;
    }
    else {
      isTouch = false;
    }
    position = evt.clientX;
    if (isTouch) {
      window.addEventListener("touchmove", onMove, true);
      window.addEventListener('touchend', onEnd, true);
    }
    else {
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener('mouseup', onEnd, true);
    }
  }

  function onMove(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.touches) evt = evt.touches[0];
    var delta = evt.clientX - position;
    position = evt.clientX;
    size += delta;
    slide(size);
  }

  function onEnd() {
    if (isTouch) {
      window.removeEventListener("touchmove", onMove, true);
      window.removeEventListener('touchend', onEnd, true);
    }
    else {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener('mouseup', onEnd, true);
    }
    position = null;
    isTouch = null;
  }

  function slide(x) {
    size = x;
    if (size < 0) size = 0;
    if (size > innerWidth - width) size = innerWidth - width;
    prefs.set("slider", size);
    $.tree.style.width = size + "px";
    $.titlebar.style.left = size + "px";
    $.main.style.left = size + "px";
  }

  return {
    get size() {
      return size;
    },
    set size(value) {
      slide(value);
    }
  };

});
