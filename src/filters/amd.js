/*global define*/
/*jshint unused:strict,undef:true,trailing:true */
define("filters/amd", function () {
  var mine = require("lib/mine");
  var pathJoin = require("lib/pathjoin");
  var binary = require('js-git/lib/binary');
  return amd;
  
  function amd(servePath, req, callback) {

    console.log("REQ", req);

    return callback(null, {etag: req.etag + "-amd", fetch: fetch});

    function fetch(callback) {
      req.target.fetch(function (err, js) {
        if (err) return callback(err);
        js = binary.toUnicode(js);
        var base = pathJoin(req.path, "..");
        var deps = mine(js);
        var length = deps.length;
        var paths = new Array(length);
        for (var i = length - 1; i >= 0; i--) {
          var dep = deps[i];
          var depPath = pathJoin(base, dep.name);
          paths[i] = depPath;
          js = js.substr(0, dep.offset) + depPath + js.substr(dep.offset + dep.name.length);
        }
        js = "define(" + JSON.stringify(req.path) + ", " +
            JSON.stringify(paths) + ", function (module, exports) {\n" +
            js + "\n});\n";
        console.log(js);
        callback(null, js);
      });
    }
  }
});

