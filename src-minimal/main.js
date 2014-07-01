"use strict";

var domChanger = require('domchanger');
var Desktop = require('./ui/desktop');

var desktop = domChanger(Desktop, document.body, {handleEvent: handleEvent});

function handleEvent() {
  console.log(arguments);
}

require('./data/config').on(function (config) {
  desktop.update(config);
});
