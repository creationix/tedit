/*global define*/
define("lib/rescape", function () {
  return rescape;

  function rescape(string) {
    return string.replace(/([.?*+^$[\]\\(){}|])/g, "\\$1")  ;
  }
});
