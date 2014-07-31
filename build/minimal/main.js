#!js

var pathJoin = require('path').join;
var bodec = require('bodec');
var mine = require('mine');
var modes = require('js-git/lib/modes');

function wrapper(name) {
  var modules = {};
  var defs = {/*DEFS*/};
  window.require = require;
  require(/*MAIN*/);
  function require(filename) {
    var module = modules[filename];
    if (module) return module.exports;
    module = modules[filename] = {exports:{}};
    var dirname = filename.substring(0, filename.lastIndexOf("/"));
    var def = defs[filename];
    if (!def) throw new Error("No such module: " + filename);
    def(module, module.exports, dirname, filename);
    return module.exports;
  }
}

module.exports = function* (pathToEntry) {

  var started = {};
  var js = "";
  var main = "src-minimal/main.js";

  yield* load(main);

  js = "(" +
    wrapper.toString()
      .replace("/*MAIN*/", JSON.stringify(main))
      .replace("/*DEFS*/", js) +
    "());\n";

  return [200, {"Content-Type":"application/javascript"}, js];

  function* load(path) {
    if (started[path]) return;
    started[path] = true;
    var meta = yield* pathToEntry(path);
    if (!meta) throw new Error("No such file: " + path);
    var blob = yield meta.repo.loadAs("blob", meta.hash);
    var code = bodec.toUnicode(blob);
    var deps = mine(code);
    var base = pathJoin(path, "..");
    for (var i = deps.length - 1; i >= 0; --i) {
      var dep = deps[i];
      var depName = dep.name;
      if (depName[0] === ".") {
        depName = yield* findLocal(pathJoin(base, depName));
      }
      else {
        depName = yield* findModule(base, depName);
      }
      if (depName) {
        yield* load(depName);
        var offset = dep.offset;
        code = code.substring(0, offset) +
          depName +
          code.substring(offset + dep.name.length);
      }
    }
    js += JSON.stringify(path) +
      ": function (module, exports, __dirname, __filename) {\n" +
      code + "\n},\n";
  }

  function* findLocal(path) {
    var meta = yield* pathToEntry(path);
    if (meta) {
      // Exact match!  Happy days.
      if (modes.isFile(meta.mode)) return path;
      if (meta.mode !== modes.tree) return;
      // Maybe it's a module with a package.json?
      var pkgPath = pathJoin(path, "package.json");
      meta = yield* pathToEntry(pkgPath);
      if (meta && modes.isFile(meta.mode)) {
        var json = yield meta.repo.loadAs("text", meta.hash);
        var pkgInfo = JSON.parse(json);
        if (pkgInfo.main) {
          return yield* findLocal(pathJoin(path, pkgInfo.main));
        }
      }
      var idxPath = pathJoin(path, "index.js");
      meta = yield* pathToEntry(idxPath);
      if (meta && modes.isFile(meta.mode)) return idxPath;
    }
    // Maybe they forgot the extension?
    path = path + ".js";
    meta = yield* pathToEntry(path);
    if (meta && modes.isFile(meta.mode)) return path;
  }

  function* findModule(base, name) {
    return (yield* findLocal(pathJoin("src", name))) ||
           (yield* findLocal(pathJoin("lib", name)));
  }

};
