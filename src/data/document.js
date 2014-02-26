"use strict";
/*global ace*/

var modelist = ace.require('ace/ext/modelist');

var whitespace = ace.require('ace/ext/whitespace');

var editor = require('ui/editor');
var binary = require('bodec');
var modes = require('js-git/lib/modes');
var recent = [];
var recentIndex = 0;
var current;

var imageTypes = {
  png: "image/png",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
};

// JSHint Options for JavaScript files
var hintOptions = [{
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
}];

module.exports = setDoc;
setDoc.next = next;
setDoc.reset = reset;

function setDoc(row, body) {
  if (!row) return editor.setDoc();
  var doc = row.doc || (row.doc = { save: save });
  doc.row = row;

  var ext = row.path.match(/[^.]*$/)[0].toLowerCase();
  var imageType = imageTypes[ext];
  if (imageType) {
    if (doc.session) delete doc.session;
    if (doc.hash !== row.hash) {
      var blob = new Blob([body], { type: imageType });
      doc.url = window.URL.createObjectURL(blob);
    }
  }
  else {
    var code = binary.toUnicode(body);
    if (doc.url) delete doc.url;
    if (!doc.session) {
      doc.session = ace.createEditSession(code);
      doc.code = code;
      doc.session.setTabSize(2);
      whitespace.detectIndentation(doc.session);
      doc.mode = 0;
    }
    else if (doc.code !== code) {
      doc.session.setValue(code, 1);
      doc.code = code;
      whitespace.detectIndentation(doc.session);
    }
    if (doc.mode !== row.mode) {
      var aceMode =
        /\.rule/.test(row.path) ? "ace/mode/jack" :
        /\.gitmodules/.test(row.path) ? "ace/mode/ini" :
        row.mode === modes.sym ? "ace/mode/text" :
        modelist.getModeForPath(row.path).mode;
      doc.session.setMode(aceMode, function () {
        if (aceMode !== "ace/mode/javascript") return;
        doc.session.$worker.call("setOptions", hintOptions);
      });
      doc.mode = row.mode;
    }

  }
  doc.hash = row.hash;

  current = doc;
  reset();
  editor.setDoc(doc);

  function save(text) {
    if (text === doc.code) return;
    doc.code = text;
    setDoc.updateDoc(row, binary.fromUnicode(text));
  }
}

function next() {
  if (!recent.length) return;
  recentIndex = (recentIndex + 1) % recent.length;
  current = recent[recentIndex];
  editor.setDoc(current);
  setDoc.setActive(current.row.path);
}

function reset() {
  if (!current) return;
  // Put current at the front of the recent list.
  var index = recent.indexOf(current);
  if (index >= 0) recent.splice(index, 1);
  recent.unshift(current);
  recentIndex = 0;
}
