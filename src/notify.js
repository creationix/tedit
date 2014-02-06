/*global define*/
define("notify", function () {
  "use strict";
  var domBuilder = require('dombuilder');
  var popup = domBuilder([".popup"]);
  var timeout = null;
  hide();
  document.body.appendChild(popup);

  return function (message) {
    popup.textContent = message;
    if (timeout) clearTimeout(timeout);
    else show();
    timeout = setTimeout(hide, 1000);
  };

  function hide() {
    popup.style.display = "none";
    timeout = null;
  }

  function show() {
    popup.style.display = "block";
  }

});