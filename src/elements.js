/*global define*/
define("elements", function () {
  "use strict";

  // Create the main UI
  var domBuilder = require('dombuilder');
  var $ = {};
  document.body.appendChild(domBuilder([
    [".tree$tree"],
    [".titlebar$titlebar", "welcome.jk"],
    [".main$main",
      [".editor$editor"]
    ]
  ], $));
  return $;
});
