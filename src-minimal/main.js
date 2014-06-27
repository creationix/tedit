"use strict";

var domChanger = require('domchanger');
var Desktop = require('./ui/desktop');

domChanger(Desktop, document.body).update();
