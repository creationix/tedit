/*global define, ace*/
define("document", function () {
  "use strict";

  var editor = require('editor');
  var modelist = ace.require('ace/ext/modelist');
  var binary = require('binary');
  var modes = require('modes');
  var whitespace = ace.require('ace/ext/whitespace');

  function Doc(path, mode, body) {
    var code;
    try { code = binary.toUnicode(body); }
    catch (err) { return; }
    this.path = path;
    this.mode = mode;
    this.code = code;
    this.session = ace.createEditSession(code);
    this.session.setTabSize(2);
    this.updateAceMode();
    whitespace.detectIndentation(this.session);
  }
  Doc.prototype.setPath = function (path) {
    this.path = path;
    this.updateAceMode();
  };
  Doc.prototype.setMode = function (mode) {
    this.mode = mode;
    this.updateAceMode();
  };
  Doc.prototype.updateAceMode = function () {
    var aceMode = this.mode === modes.sym ?
      "ace/mode/text" : modelist.getModeForPath(this.path).mode;
    console.log(aceMode)
    if (this.aceMode === aceMode) return;
    this.aceMode = aceMode;
    this.session.setMode(aceMode);
  };
  Doc.prototype.setBody = function (body) {
    var code;
    try { code = binary.toUnicode(body); }
    catch (err) { return; }
    this.code = code;
    this.session.setValue(code, 1);
    whitespace.detectIndentation(this.session);
  };
  Doc.prototype.activate = function () {
    editor.setDoc(this);
  };

  return newDoc;

  function newDoc(path, mode, body) {

    return new Doc(path, mode, body);
  }
});