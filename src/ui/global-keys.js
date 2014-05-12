/*global chrome*/
"use strict";

var zoom = require('./zoom');
var editor = require('./editor');
var tree = require('./tree');
var dialog = require('./dialog');
var doc = require('data/document');
var pending;

window.addEventListener("keydown", onDown, true);
window.addEventListener("keyup", onUp, true);
window.addEventListener("keypress", onPress, true);
function onDown(evt) {
  // Combine all combinations into number from 0 to 15.
  var combo =
    (evt.ctrlKey ? 1 : 0) |
    (evt.shiftKey ? 2 : 0) |
    (evt.altKey ? 4 : 0) |
    (evt.metaKey ? 8 : 0);

  // Ctrl-0
  if (combo === 1 && evt.keyCode === 48) zoom.reset();
  // Ctrl-"+"
  else if (combo === 1 && evt.keyCode === 187) zoom.bigger();
  // Ctrl-"-"
  else if (combo === 1 && evt.keyCode === 189) zoom.smaller();

  // Ctrl-Shift-R
  else if (combo === 3 && evt.keyCode === 82) chrome.runtime.reload();

  // Ctrl-B
  else if (combo === 1 && evt.keyCode === 66) editor.nextTheme();
  // Ctrl-Shift-B
  else if (combo === 3 && evt.keyCode === 66) editor.prevTheme();

  else if (dialog.close) {
    // Esc closes a dialog
    if (combo === 0 && evt.keyCode === 27) dialog.close();
    else return;
  }
  // Alt+` switches between documents
  else if (combo === 4 && evt.keyCode === 192) {
    pending = true;
    doc.next();
  }
  // Control-E Toggles Tree
  else if (combo === 1 && evt.keyCode === 69) tree.toggle();
  // Control-N Create new file
  else if (combo === 1 && evt.keyCode === 78) tree.newFile();
  else if (!tree.isFocused()) return;
  else if (combo === 0 && evt.keyCode === 33) tree.pageUp();
  else if (combo === 0 && evt.keyCode === 34) tree.pageDown();
  else if (combo === 0 && evt.keyCode === 35) tree.end();
  else if (combo === 0 && evt.keyCode === 36) tree.home();
  else if (combo === 0 && evt.keyCode === 37) tree.left();
  else if (combo === 0 && evt.keyCode === 38) tree.up();
  else if (combo === 0 && evt.keyCode === 39) tree.right();
  else if (combo === 0 && evt.keyCode === 40) tree.down();
  else if (combo === 0 && evt.keyCode === 27) tree.cancel();
  else if (combo === 0 && evt.keyCode ===  8) tree.backspace();
  else if (combo === 0 && evt.keyCode === 13) { // Enter
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
