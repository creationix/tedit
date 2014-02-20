var parseConfig = require('js-git/lib/config-codec').parse;
var encodeConfig = require('js-git/lib/config-codec').encode;
var binary = require('binary');
var carallel = require('carallel');

module.exports = {
  add: addGitmodule,
  remove: removeGitmodule,
  load: loadGitmodule,
  find: findGitmodule,
  flush: flushChanges,
};

var pendingChanges = {};
