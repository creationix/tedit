/*global define, chrome*/
define("elements", function () {
  "use strict";

  // Create the main UI
  var domBuilder = require('dombuilder');
  var $ = {};
  document.body.appendChild(domBuilder([
    ["ul.tree$tree"],
    [".titlebar$titlebar", "welcome.jk"],
    [".closebox$closebox", {onclick: closeWindow}, "×"],
    [".main$main",
      [".editor$editor"],
      [".preview$preview", {css: {display:"none"}},
        [".dragger$dragger"],
        [".image$image"]
      ]
    ]
  ], $));

  // Hook for global zoom keybindings
  require('zoom')(onZoom);

  return $;

  function onZoom(scale) {
    document.body.style.fontSize = (scale * 16) + "px";
  }

  function closeWindow() {
    chrome.app.window.current().close();
  }
});
