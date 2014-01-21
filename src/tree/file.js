/*global define, ace, URL*/
define("tree/file", function () {
  "use strict";

  var Node = require('tree/node');
  var editor = require('editor');
  var binary = require('binary');
  var $ = require('elements');
  var modelist = ace.require('ace/ext/modelist');
  var whitespace = ace.require('ace/ext/whitespace');

  function File() {
    Node.apply(this, arguments);
    this.session = null;
  }

  // Inherit from Node
  File.prototype = Object.create(Node.prototype, {
    constructor: { value: File }
  });

  File.prototype.onActivate = function (soft) {
    var self = this;
    if (this.session) return onSession();

    self.repo.loadAs("blob", self.hash, function (err, buffer) {
      if (err) throw err;
      var imageMime = imagetypes[self.name.substr(self.name.lastIndexOf(".") + 1)];
      if (imageMime) {
        self.session = {
          tiled: false,
          url: URL.createObjectURL(new Blob([buffer], {type: imageMime}))
        };
        return onSession();
      }

      var mode = modelist.getModeForPath(self.name);
      var code;

      try {
        code = binary.toUnicode(buffer);
      }
      catch (err) {
        // Data is not unicode!
        return;
      }
      self.session = ace.createEditSession(code, mode.mode);
      whitespace.detectIndentation(self.session);
      return onSession();
    });

    function onSession() {
      editor.setSession(self.session);
      $.titlebar.textContent = self.name;
      if (!soft) editor.focus();
    }
  };

  File.prototype.onDeactivate = function () {
    editor.setSession(editor.fallbackSession);
    $.titlebar.textContent = "welcome.jk";
  };

  var imagetypes = {
    gif:  "image/gif",
    jpg:  "image/jpeg",
    jpeg: "image/jpeg",
    png:  "image/png",
    svg:  "image/svg+xml",
  };

  return File;
});
