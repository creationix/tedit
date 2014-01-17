/*global define*/
define("slider", ["elements"], function ($) {
  
  var position = null;
  var isTouch = false;
  var size = 200;
  var width = 8;
  var innerWidth;

  onResize();
  slide(size);

  window.addEventListener("resize", onResize);
  $.slider.addEventListener("mousedown", onStart, true);
  $.slider.addEventListener("touchstart", onStart, true);

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
    if (size < 0) size = 0;
    if (size > innerWidth - width) size = innerWidth - width;
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

  function slide(x, w) {
    if (w === undefined) w = 8;
    $.slider.style.left = x + "px";
    $.slider.style.width = w + "px";
    $.tree.style.width = x + "px";
    $.titlebar.style.left = (x + w) + "px";
    $.main.style.left = (x + w) + "px";
  }

});
