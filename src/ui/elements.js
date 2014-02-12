"use strict";
/*global chrome*/

// Create the main UI
var domBuilder = require('../lib/dombuilder.js');
var $ = {};
document.body.appendChild(domBuilder([
  [".wrap",
    ["ul.tree$tree"],
    [".main$main",
      [".editor$editor"],
      [".preview$preview", {css: {display:"none"}},
        [".dragger$dragger"],
        [".image$image"]
      ]
    ],
    [".titlebar$titlebar", "welcome.jk"],
  ],
  [".closebox$closebox", {onclick: closeWindow}, "×"],
], $));

// Hook for global zoom keybindings
require('./zoom.js')(onZoom);

module.exports = $;

function onZoom(scale) {
  document.body.style.fontSize = (scale * 16) + "px";
}

function closeWindow() {
  chrome.app.window.current().close();
}
