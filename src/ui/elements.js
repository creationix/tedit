"use strict";
/*global chrome*/
var isChrome = window.chrome && window.chrome.app && window.chrome.app.window;

// Create the main UI
var domBuilder = require('dombuilder');
// Hook for global zoom keybindings
require('./zoom')(onZoom);

var $ = {};
document.body.appendChild(domBuilder([
  [".wrap",
    ["ul.tree.blur$tree"],
    [".main$main",
      [".editor$editor"],
      [".preview$preview", {css: {display:"none"}},
        [".dragger$dragger"],
        [".image$image"]
      ]
    ],
    [".titlebar$titlebar"],
  ],
  isChrome ? [".closebox$closebox", {onclick: closeWindow}, "×"]: [],
], $));


module.exports = $;

function onZoom(scale) {
  document.body.style.fontSize = (scale * 16) + "px";
}

function closeWindow() {
  chrome.app.window.current().close();
}
