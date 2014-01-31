/*global define*/
define("document", function () {
  "use strict";

  var editor = require('editor');
  var active = null;

  function Doc(path, mode, body) {

    this.path = path;
    this.mode = mode;
    // console.log("INITIAL");
  }
  Doc.prototype.setPath = function (path) {
    this.path = path;
    console.log("path changed");
  };
  Doc.prototype.setMode = function (mode) {
    this.mode = mode;
    console.log("mode changed");
  };
  Doc.prototype.setBody = function (body) {
    console.log("BODY", body);
    console.log("body changed");
  };
  Doc.prototype.activate = function () {
    // console.log("ACTIVATE");
    // editor.setDoc(this);
  };

  return newDoc;

  function newDoc(path, mode, body) {

    return new Doc(path, mode, body);
  }
});