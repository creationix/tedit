/*global define*/
define("encodeconfig", function () {

  return encode;

  function encode(config) {
    var lines = [];
    Object.keys(config).forEach(function (type) {
      var obj = config[type];
      Object.keys(obj).forEach(function (name) {
        var item = obj[name];
        lines.push('[' + type + ' "' + name + '"]');
        Object.keys(item).forEach(function (key) {
          var value = item[key];
          lines.push("\t" + key + " = " + value);
        });
        lines.push("");
      });
    });
    return lines.join("\n");
  }
});
