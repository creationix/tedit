"use strict";
var dragging = {};

// Given a move handler, call it while dragging with delta-x and delta-y
// Supports mouse-events, touch-events and pointer-events.
// Returns a map of event handlers for use in domchanger
// Usage: drag(onMove(dx, dy){}) -> props
module.exports = drag;

var usePointer = !!window.PointerEvent;

// Need global events for up and move since the target often changes.
if (usePointer) {
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointermove", onPointerMove);
}
else {
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("touchend", onTouchEnd);
  window.addEventListener("touchmove", onTouchMove);
}

function drag(fn) {
  return usePointer ? {
    onpointerdown: onPointerDown
  } : {
    onmousedown: onMouseDown,
    ontouchstart: onTouchStart
  };

  function onPointerDown(evt) {
    var id = evt.pointerId;
    if (dragging[id]) return;
    evt.preventDefault();
    start(id, evt.clientX, evt.clientY, fn);
  }

  function onTouchStart(evt) {
    var found = false;
    for (var i = 0; i < evt.changedTouches.length; i++) {
      var touch = evt.changedTouches[i];
      var id = touch.identifier;
      if (!dragging[id]) {
        found = true;
        start(id, touch.clientX, touch.clientY, fn);
      }
    }
    if (found) {
      evt.preventDefault();
    }
  }

  function onMouseDown(evt) {
    if (dragging.mouse) return;
    evt.preventDefault();
    start("mouse", evt.clientX, evt.clientY, fn);
  }
}

function onPointerMove(evt) {
  var id = evt.pointerId;
  if (!dragging[id]) return;
  evt.preventDefault();
  evt.stopPropagation();
  move(id, evt.clientX, evt.clientY);
}

function onPointerUp(evt) {
  var id = evt.pointerId;
  if (!dragging[id]) return;
  evt.preventDefault();
  evt.stopPropagation();
  stop(id);
}

function onTouchMove(evt) {
  var found = false;
  for (var i = 0; i < evt.changedTouches.length; i++) {
    var touch = evt.changedTouches[i];
    var id = touch.identifier;
    if (dragging[id]) {
      found = true;
      move(id, touch.clientX, touch.clientY);
    }
  }
  if (found) {
    evt.preventDefault();
    evt.stopPropagation();
  }
}

function onTouchEnd(evt) {
  var found = false;
  for (var i = 0; i < evt.changedTouches.length; i++) {
    var touch = evt.changedTouches[i];
    var id = touch.identifier;
    if (dragging[id]) {
      found = true;
      stop(id);
    }
  }
  if (found) {
    evt.preventDefault();
    evt.stopPropagation();
  }
}

function onMouseMove(evt) {
  if (!dragging.mouse) return;
  evt.preventDefault();
  evt.stopPropagation();
  move("mouse", evt.clientX, evt.clientY);
}

function onMouseUp(evt) {
  if (!dragging.mouse) return;
  evt.preventDefault();
  evt.stopPropagation();
  stop("mouse");
}


function start(id, x, y, fn) {
  dragging[id] = {
    x: x,
    y: y,
    fn: fn
  };
}

function move(id, x, y) {
  var data = dragging[id];
  data.fn(x - data.x, y - data.y);
  data.x = x;
  data.y = y;
}

function stop(id) {
  dragging[id] = null;
}
