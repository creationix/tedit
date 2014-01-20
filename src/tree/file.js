/*global define, ace*/
define("tree/file", function () {
  "use strict";

  var Node = require('tree/node');
  var editor = require('editor');
  var $ = require('elements');
  var modelist = ace.require('ace/ext/modelist');

  function File() {
    Node.apply(this, arguments);
    this.session = null;
  }

  // Inherit from Node
  File.prototype = Object.create(Node.prototype, {
    constructor: { value: File }
  });

  File.prototype.onActivate = function (soft) {
    if (!this.session) {
      var self = this;
      self.repo.loadAs("text", self.hash, function (err, code) {
        if (err) throw err;
        var mode = modelist.getModeForPath(self.name);
        self.session = ace.createEditSession(code, mode.mode);
        editor.setSession(self.session);
        $.titlebar.textContent = self.name;
      });
    }
    else {
      editor.setSession(this.session);
      $.titlebar.textContent = this.name;
    }
    if (!soft) editor.focus();
  };

  File.prototype.onDeactivate = function () {
    editor.setSession(editor.fallbackSession);
    $.titlebar.textContent = "welcome.jk";
  };

  return File;
});
