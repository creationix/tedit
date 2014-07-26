// Top level file is just a mixin of submodules & constants
'use strict';

var assign    = require('./pako/utils/common').assign;

var deflate   = require('./pako/deflate');
var inflate   = require('./pako/inflate');
var constants = require('./pako/zlib/constants');

var pako = {};

assign(pako, deflate, inflate, constants);

module.exports = pako;