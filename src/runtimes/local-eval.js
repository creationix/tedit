
exports.menuItem = {
  icon: "asterisk",
  label: "Eval in Main",
  action: execFile
};

var defer = require('js-git/lib/defer');
var editor = require('ui/editor');
var tree = require('ui/tree');
var mine = require('mine');
var fs = require('data/fs');
var pathJoin = require('pathjoin');
var bodec = require('bodec');
var run = require('gen-run');

function execFile(row) {

  var modules = {};
  var defs = {};
  var loading = {};

  tree.activateDoc(row, true, function () {
    var js = editor.getText();
    var path = "vfs:/" + row.path;
    load(path, js, function (err) {
      if (err) row.fail(err);
      defer(function () {
        try { fakeRequire(path); }
        catch (err) { row.fail(err); }
      });
    });
  });

  function fakeRequire(path) {
    if (path in modules) {
      return modules[path].exports;
    }
    if (path in defs) {
      var exports = {};
      var module = modules[path] = { exports: exports };
      var filename = path.substring(5);
      var dirname = pathJoin(filename, "..");
      defs[path](run, fakeRequire, module, exports, dirname, filename);
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
    // Allow yield and yield* in any script body!
    js = "run(function* () {" + js + "});";
    if (!window.hasGenerators) {
      var regenerator = require('tedit-regenerator/regenerator-bundle');
      // var regenerator = require('regenerator');
      js = regenerator(js);
    }
    var url = URL.createObjectURL(new Blob([
      "window[" + JSON.stringify(path) + "](function (run, require, module, exports, __dirname, __filename) {" + js + "});\n"
    ], {type: 'application/javascript'}));
    var old = window.path;
    if (old) URL.revokeObjectURL(old);
    window[path] = function (fn) {
      document.head.removeChild(tag);
      window[path] = url;
      defs[path] = fn;
      check();
    };
    var tag = document.createElement('script');
    tag.setAttribute("charset", "utf-8");
    tag.setAttribute("src", url);
    document.head.appendChild(tag);

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
