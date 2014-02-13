"use strict";

var domBuilder = require('lib/dombuilder');
var popup = domBuilder([".popup"]);
var timeout = null;
hide();
document.body.appendChild(popup);

module.exports = function (message) {
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
