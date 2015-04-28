"use strict";

var AppWindow = require('./app-window');
var CodeMirrorEditor = require('./code-mirror-editor');

var jkl = '-- Inverted question mark!\n(macro (¿ no yes cond)\n  [[:? cond yes no]]\n)\n\n-- Sample output for 3x3 maze\n\n-- ██████████████\n-- ██      ██  ██\n-- ██  ██████  ██\n-- ██          ██\n-- ██  ██  ██████\n-- ██  ██      ██\n-- ██████████████\n\n(def width 30)\n(def height 30)\n(def size (× width height))\n\n-- Cells point to parent\n(def cells (map (i size) [i null]))\n\n-- Walls flag right and bottom\n(def walls (map (i size) [true true]))\n\n-- Define the sequence of index and right/left\n(def ww (- width 1))\n(def hh (- height 1))\n(def sequence (shuffle (concat\n  (map (i size)\n    (if (< (% i width) ww) [true i])\n  )\n  (map (i size)\n    (if (< (÷ i width) hh) [false i])\n  )\n)))\n\n-- Find the root of a set cell -> cell\n(def (find-root cell)\n  (? (. cell 1) (find-root (. cell 1)) cell)\n)\n\n(for (item sequence)\n  (def i (. item 1))\n  (def root (find-root (. cells i)))\n  (def other (find-root (. cells (+ i (? (. item 0) 1 width)))))\n  (if (≠ (. root 0) (. other 0))\n    (. root 1 other)\n    (. (. walls i) (? (. item 0) 0 1) false)\n  )\n)\n\n(def w (× width 2))\n(def h (× height 2))\n(join "\\n" (map (y (+ h 1))\n  (join "" (map (x (+ w 1))\n    (¿ "  " "██" (or\n      -- Four outer edges are always true\n      (= x 0) (= y 0) (= x w) (= y h)\n      -- Inner cells are more complicated\n      (? (% y 2)\n        (? (% x 2)\n           -- cell middle\n          false\n          -- cell right\n          (. (. walls (+ (÷ (- x 1) 2) (× (÷ y 2) width))) 0)\n        )\n        (? (% x 2)\n          -- cell bottom\n          (. (. walls (+ (÷ x 2) (× (÷ (- y 1) 2) width))) 1)\n          -- cell corner\n          true\n        )\n      )\n    ))\n  ))\n))\n';

var config = require('../data/config');
module.exports = Desktop;

function Desktop(emit, refresh) {
  var isDark = false;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onResize);
  var width = window.innerWidth;
  var height = window.innerHeight;
  var windows = [
    { id: genId(),
      title: "config.jon", code: config.get(), mode: "jon" },
    { id: genId(),
      title: "bananas/samples/maze.jkl", code: jkl, mode: "jackl" },
  ];

  return {
    render: render,
    on: {
      destroy: onWindowDestroy,
      focus: onWindowFocus
    }
  };

  function findWindow(id) {
    for (var i = 0; i < windows.length; i++) {
      if (windows[i].id === id) return i;
    }
    throw new Error("Invalid window id: " + id);
  }

  function onWindowDestroy(id) {
    windows.splice(findWindow(id), 1);
    refresh();
  }

  function onWindowFocus(id) {
    var dirty = false;
    for (var i = 0; i < windows.length; i++) {
      var window = windows[i];
      var focused = window.id === id;
      if (focused !== window.focused) {
        window.focused = focused;
        dirty = true;
      }
      windows[i].focused = windows[i].id === id;
    }
    if (dirty) refresh();
  }

  function onResize(evt) {
    var newWidth = window.innerWidth;
    var newHeight = window.innerHeight;
    if (newWidth !== width || newHeight !== height) {
      width = newWidth;
      height = newHeight;
      refresh();
    }
  }

  function onKeyDown(evt) {
    var mod = (evt.ctrlKey  ? 1 : 0) |
              (evt.shiftKey ? 2 : 0) |
              (evt.altKey   ? 4 : 0) |
              (evt.metaKey  ? 8 : 0);
    if (mod === 1 && evt.keyCode === 66) {
      // Control-B - toggle theme
      evt.preventDefault();
      isDark = !isDark;
      refresh();
    }
  }

  function render() {
    return windows.map(function (props) {
      var ui = [AppWindow, width, height, isDark, props,
        [CodeMirrorEditor, isDark, props]
      ];
      ui.key = props.id;
      return ui;
    });
  }
}


function genId() {
  return Date.now().toString(36) + (Math.random() * 0x100000000).toString(36);
}