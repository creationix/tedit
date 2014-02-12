/*global chrome*/
"use strict";

var zoom = require('./zoom.js');
var editor = require('./editor.js');
var doc = require('../data/document.js');
var pending;

window.addEventListener("keydown", onDown, true);
window.addEventListener("keyup", onUp, true);
function onDown(evt) {
  // Ctrl-0
  if (evt.ctrlKey && !evt.shiftKey && evt.keyCode === 48) zoom.reset();
  // Ctrl-"+"
  else if (evt.ctrlKey && !evt.shiftKey && evt.keyCode === 187) zoom.bigger();
  // Ctrl-"-"
  else if (evt.ctrlKey && !evt.shiftKey && evt.keyCode === 189) zoom.smaller();
  // Ctrl-Shift-R
  else if (evt.ctrlKey && evt.shiftKey && evt.keyCode === 82) chrome.runtime.reload();
  // Ctrl-E
  else if (evt.ctrlKey && evt.keyCode === 69) {
    pending = true;
    doc.next();
  }
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
function onUp(evt) {
  if (evt.keyCode === 0x11) {
    if (pending) {
      pending = false;
      doc.reset();
    }
  }
}
