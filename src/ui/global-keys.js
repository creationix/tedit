/*global chrome*/
"use strict";

var zoom = require('./zoom');
var editor = require('./editor');
var tree = require('./tree');
var dialog = require('./dialog');
var doc = require('data/document');
var os = require('data/os');
var pending;

window.addEventListener("keydown", onDown, true);
window.addEventListener("keyup", onUp, true);
window.addEventListener("keypress", onPress, true);
function onDown(evt) {
  var ctrlOrMeta = os.isMac ? evt.metaKey : evt.ctrlKey;
  // Ctrl-0
  if (ctrlOrMeta && !evt.shiftKey && evt.keyCode === 48) zoom.reset();
  // Ctrl-"+"
  else if (ctrlOrMeta && !evt.shiftKey && evt.keyCode === 187) zoom.bigger();
  // Ctrl-"-"
  else if (ctrlOrMeta && !evt.shiftKey && evt.keyCode === 189) zoom.smaller();
  // Ctrl-Shift-R
  else if (ctrlOrMeta && evt.shiftKey && evt.keyCode === 82) chrome.runtime.reload();
  else if (ctrlOrMeta && evt.keyCode === 66) {
    // Ctrl-Shift-B
    if (evt.shiftKey) editor.prevTheme();
    // Ctrl-B
    else editor.nextTheme();
  }
  else if (dialog.close) {
    // Esc closes a dialog
    if (evt.keyCode === 27) dialog.close();
    else return;
  }
  // Alt+` switches between documents
  else if ((os.isMac ? evt.ctrlKey : evt.altKey) && evt.keyCode === 192) {
    pending = true;
    doc.next();
  }
  // Control-E Toggles Tree
  else if (ctrlOrMeta && evt.keyCode === 69) {
    tree.toggle();
  }
  // Control-N Create new file
  else if (ctrlOrMeta && !evt.shiftKey && evt.keyCode === 78) {
    tree.newFile();
  }
  else if (!tree.isFocused()) return;
  else if (evt.keyCode === 33) tree.pageUp();
  else if (evt.keyCode === 34) tree.pageDown();
  else if (evt.keyCode === 35) tree.end();
  else if (evt.keyCode === 36) tree.home();
  else if (evt.keyCode === 37) tree.left();
  else if (evt.keyCode === 38) tree.up();
  else if (evt.keyCode === 39) tree.right();
  else if (evt.keyCode === 40) tree.down();
  else if (evt.keyCode === 27) tree.cancel();
  else if (evt.keyCode ===  8) tree.backspace();
  else if (evt.keyCode === 13) { // Enter
    tree.activate();
  }
  else return;
  evt.preventDefault();
  evt.stopPropagation();
}
function onPress(evt) {
  if (dialog.close || !tree.isFocused()) return;
  evt.preventDefault();
  evt.stopPropagation();
  tree.onChar(evt.charCode);
}
function onUp(evt) {
  if (evt.keyCode === 18) {
    if (pending) {
      pending = false;
      doc.reset();
    }
  }
}
