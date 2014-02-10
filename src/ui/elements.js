/*global define, chrome*/
define("ui/elements", function () {
  "use strict";

  // Create the main UI
  var domBuilder = require('lib/dombuilder');
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
  require('ui/zoom')(onZoom);

  return $;

  function onZoom(scale) {
    document.body.style.fontSize = (scale * 16) + "px";
  }

  function closeWindow() {
    chrome.app.window.current().close();
  }
});
