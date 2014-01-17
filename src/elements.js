/*global define*/
define(function () {
  "use strict";

  // Create the main UI
  var domBuilder = require('dombuilder');
  var $ = {};
  document.body.setAttribute("class", "splitview horizontal");
  document.body.appendChild(domBuilder([
    [".tree$tree"],
    [".slider$slider"],
    [".titlebar$titlebar", "welcome.jk"],
    [".main$main",
      [".editor$editor"]
    ]
  ], $));
  return $;
});
