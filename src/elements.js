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
      [".editor$editor"]
    ]
  ], $));
  return $;

  function closeWindow() {
    chrome.app.window.current().close();
  }
});
