/*global define, ace*/
define("tree/file", function () {
  "use strict";

  var Node = require('tree/node');
  var editor = require('editor');

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
        var mode = guessMode(code, self.name);
        console.log("MODE", mode);
        self.session = ace.createEditSession(code, mode);
        editor.setSession(self.session);
      });
    }
    else {
      editor.setSession(this.session);
    }
    if (!soft) editor.focus();
  };

  File.prototype.onDeactivate = function () {
    editor.setSession(editor.fallbackSession);
  };

  function guessMode(code, name) {
    var ext = name.match(/[^.]*$/)[0];
    return modes[ext] || "ace/modes/text";
  }

  var modes = {
    js: "ace/mode/javascript",
    jk: "ace/mode/jack",
    css: "ace/mode/css",
    html: "ace/mode/html",
    sh: "ace/mode/sh",
    json: "ace/mode/json",
    md: "ace/mode/markdown",
    markdown: "ace/mode/markdown",
  };

  return File;
});
