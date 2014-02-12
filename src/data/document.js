"use strict";
/*global ace*/

var modelist = ace.require('ace/ext/modelist');
var whitespace = ace.require('ace/ext/whitespace');

var editor = require('../ui/editor.js');
var binary = require('../js-git/lib/binary.js');
var modes = require('../js-git/lib/modes.js');
var recent = [];
var recentIndex = 0;
var current;

Doc.next = next;
Doc.reset = reset;
module.exports = Doc;

function next() {
  if (!recent.length) return;
  recentIndex = (recentIndex + 1) % recent.length;
  current = recent[recentIndex];
  editor.setDoc(current);
  console.log("NEXT");
}

function reset() {
  if (!current) return;
  // Put current at the front of the recent list.
  var index = recent.indexOf(current);
  if (index >= 0) recent.splice(index, 1);
  recent.unshift(current);
  recentIndex = 0;
}

function Doc(path, mode, body) {
  if (!(this instanceof Doc)) return new Doc(path, mode, body);
  var code = binary.toUnicode(body);
  this.path = path;
  this.mode = mode;
  this.code = code;
  this.session = ace.createEditSession(code);
  this.session.setTabSize(2);
  this.updateAceMode();
  whitespace.detectIndentation(this.session);
}

Doc.prototype.update = function (path, mode, body) {
  this.path = path;
  this.mode = mode;
  this.updateAceMode();
  if (body !== undefined) this.setBody(body);
};

Doc.prototype.updatePath = function (path) {
  this.path = path;
  this.updateAceMode();
  editor.updatePath(this);
};

Doc.prototype.updateAceMode = function () {
  var aceMode = this.mode === modes.sym ?
    "ace/mode/text" : modelist.getModeForPath(this.path).mode;
  if (this.aceMode === aceMode) return;
  this.aceMode = aceMode;
  var session = this.session;
  session.setMode(aceMode, function () {
    if (aceMode === "ace/mode/javascript") {
      // Tweak js-hint settings for JavaScript
      session.$worker.call("setOptions", [{
        unused: true,
        undef: true,
        esnext: true,
        browser: true,
        node: true,
        onevar: false,
        passfail: false,
        maxerr: 100,
        multistr: true,
        globalstrict: true
      }]);
    }
  });
};

Doc.prototype.setBody = function (body) {
  var code = binary.toUnicode(body);
  if (code === this.code) return;
  this.code = code;
  this.session.setValue(code, 1);
  whitespace.detectIndentation(this.session);
};

Doc.prototype.activate = function () {
  current = this;
  reset();
  editor.setDoc(this);
};

Doc.prototype.save = function (text) {
  if (text === this.code) return;
  this.code = text;
  var body = binary.fromUnicode(text);
  this.updateTree(body);
};
