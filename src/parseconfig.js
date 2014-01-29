/*global define*/
define("parseconfig", function () {
  return parse;

  function parse(text) {
    var config = {};
    var match, offset = 0;
    while (match = text.substr(offset).match(/\[([a-z]*) "([^"]*)"\]([^\[]*)/)) {
      var type = match[1];
      var section = config[type] || (config[type] = {});
      var name = match[2];
      section[name] = parseBody(match[3]);
      offset += match[0].length;
    }
    return config;
  }

  function parseBody(text) {
    var entry = {};
    var match, offset = 0;
    while (match = text.substr(offset).match(/([^ \t\r\n]*) *= *([^ \t\r\n]*)/)) {
      entry[match[1]] = match[2];
      offset += match[0].length;
    }
    return entry;
  }
});