/*global define*/
define("filters/amd", function () {
  var mine = require("lib/mine");
  var pathJoin = require("lib/pathjoin");
  var binary = require('js-git/lib/binary');
  return amd;

  function amd(servePath, req, callback) {

    var prefix = req.args[0];
    var base = pathJoin(req.path, "..");
    if (prefix) {
      prefix = pathJoin(base, prefix);
      if (prefix === base) base = "";
      else if (base.substring(0, prefix.length + 1) === prefix +"/") {
        base = base.substring(prefix.length + 1);
      }
    }

    if (req.args[1]) {
      base = pathJoin(base, req.args[1]);
    }

    var name = req.path.substring(req.path.lastIndexOf("/") + 1);


    return callback(null, {etag: req.target.etag + "-amd", fetch: fetch});

    function fetch(callback) {
      req.target.fetch(function (err, js) {
        if (err) return callback(err);
        js = binary.toUnicode(js);
        var deps = mine(js);
        var length = deps.length;
        var paths = new Array(length);
        for (var i = length - 1; i >= 0; i--) {
          var dep = deps[i];
          var depPath = pathJoin(base, dep.name);
          paths[i] = depPath;
          js = js.substr(0, dep.offset) + depPath + js.substr(dep.offset + dep.name.length);
        }
        js = "define(" + JSON.stringify(pathJoin(base, name)) + ", " +
            JSON.stringify(paths) + ", function (module, exports) {\n" +
            js + "\n});\n";
        callback(null, js);
      });
    }
  }
});
