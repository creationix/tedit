/*global define*/
define("progress", function () {
  "use strict";
  var domBuilder = require('dombuilder');
  var popup = domBuilder([".popup"]);
  var active = false;
  var timeout = null;
  hide();
  document.body.appendChild(popup);

  return function (repo) {
    repo.onProgress = notify;
  };

  function notify(message) {
    if (message) {
      popup.textContent = message;
      if (active) return;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      active = true;
      popup.style.opacity = 1;
      return;
    }
    if (!active) return;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    timeout = setTimeout(hide, 750);
  }

  function hide() {
    active = false;
    popup.style.opacity = 0;
  }

});