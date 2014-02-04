/*global define*/
define("fail", function () {
  "use strict";
  return fail;
  // A more user friendly throw that shows the source of the error visually
  // to the user with a short message.
  function fail($, err) {
    $.icon.setAttribute("class", "icon-attention");
    $.icon.setAttribute("title", $.icon.getAttribute("title") + "\n" + err.toString());
    throw err;
  }
});
