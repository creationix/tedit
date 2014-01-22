/*global define*/
define("slider", function () {
  "use strict";

  require('editor');

  var $ = require("elements");
  var prefs = require('prefs');
  var position = null;
  var isTouch = false;
  var size = prefs.get("slider", 200);
  var innerWidth;

  innerWidth = window.innerWidth;
  slide(size);
  var gutter = document.querySelector(".ace_gutter");
  var dragger = document.querySelector(".dragger");

  window.addEventListener("resize", onResize);
  gutter.addEventListener("mousedown", onStart, true);
  gutter.addEventListener("touchstart", onStart, true);
  dragger.addEventListener("mousedown", onStart, true);
  dragger.addEventListener("touchstart", onStart, true);

  require('zoom')(onZoom);

  function onZoom(scale, oldScale) {
    slide(Math.round(size / oldScale * scale));
  }

  function onResize() {
    innerWidth = window.innerWidth;
    slide(size);
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
    if (size > innerWidth - 42) size = innerWidth - 42;
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
