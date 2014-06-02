define("data/rescape.js", [], function (module, exports) { module.exports = rescape;

// Escape a string for inclusion in a regular expression.
function rescape(string) {
  return string.replace(/([.?*+^$[\]\\(){}|])/g, "\\$1")  ;
}

});
