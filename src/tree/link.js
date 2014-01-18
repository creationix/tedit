/*global define*/
define("tree/link", function () {
  "use strict";

  var Node = require('tree/node');

  function SymLink() {
    Node.apply(this, arguments);
  }

  // Inherit from Node
  SymLink.prototype = Object.create(Node.prototype, {
    constructor: { value: SymLink }
  });

  return SymLink;
});
