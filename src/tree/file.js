/*global define*/
define("tree/file", function () {
  "use strict";

  var Node = require('tree/node');

  function File() {
    Node.apply(this, arguments);
  }

  // Inherit from Node
  File.prototype = Object.create(Node.prototype, {
    constructor: { value: File }
  });

  return File;
});
