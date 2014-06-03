define("runtimes/local-eval.js", ["ui/editor.js","ui/tree.js","mine.js","data/fs.js","pathjoin.js","bodec.js"], function (module, exports) { 
exports.menuItem = {
  icon: "asterisk",
  label: "Eval in Main",
  action: execFile
};

var editor = require('ui/editor.js');
var tree = require('ui/tree.js');
var mine = require('mine.js');
var fs = require('data/fs.js');
var pathJoin = require('pathjoin.js');
var bodec = require('bodec.js');

function execFile(row) {

  var modules = {};
  var defs = {};
  var loading = {};

  tree.activateDoc(row, true, function () {
    var js = editor.getText();
    var path = "vfs:/" + row.path;
    load(path, js, function (err) {
      if (err) row.fail(err);
      try { fakeRequire(path); }
      catch (err) { row.fail(err); }
    });
  });

  function fakeRequire(path) {
    if (path in modules) {
      return modules[path].exports;
    }
    if (path in defs) {
      var exports = {};
      var module = modules[path] = { exports: exports };
      defs[path](fakeRequire, module, exports, pathJoin(path, ".."), path);
      return module.exports;
    }
    return require(path);
  }

  function load(path, js, callback, force) {
    if (!force && (defs[path] || modules[path] || loading[path])) return callback();
    loading[path] = true;
    if (js === null || js === undefined) {
      return fs.readBlob(path.substring(4), function (err, entry) {
        if (err || !entry || !entry.hash) {
          return callback(err || new Error("Missing file " + path));
        }
        return load(path, bodec.toUnicode(entry.blob), callback, true);
      });
    }
    var left = 1;
    mine(js).reverse().forEach(function (dep) {
      var len = dep.name.length;
      if (!/\.js$/.test(dep.name)) {
        dep.name += ".js";
      }
      if (dep.name[0] === ".") {
        dep.name = pathJoin(path, "..", dep.name);
        left++;
        load(dep.name, null, check);
      }
      js = js.substring(0, dep.offset) + dep.name + js.substring(dep.offset + len);
    });
    defs[path] = new Function("require", "module", "exports", "__dirname", "__filename", js);
    check();
    var done;

    function check(err) {
      if (done) return;
      if (err) {
        done = true;
        return callback(err);
      }

      if (!--left) {
        done = true;
        return callback();
      }
    }

  }

}

});
