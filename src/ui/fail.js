/*global define*/
define("ui/fail", function () {
  "use strict";
  return fail;
  // A more user friendly throw that shows the source of the error visually
  // to the user with a short message.
  function fail(node, err) {
    node.errorMessage = err.toString();
    throw err;
  }
});
