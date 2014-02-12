module.exports = rescape;

function rescape(string) {
  return string.replace(/([.?*+^$[\]\\(){}|])/g, "\\$1")  ;
}
