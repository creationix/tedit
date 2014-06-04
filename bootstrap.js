// Tiny AMD loader that auto-loads src/main.js
(function () {
  "use strict";
  var modules = {};
  var defs = {};
  var ready = {};
  var pending = {};
  var scripts = {};
  window.define = define;
  window.require = requireSync;
  window.requireAsync = requireAsync;
  window.defs = defs;
  document.body.textContent = "";

  modules["forge.js"] = window.forge;
  ready["forge.js"] = true;

  requireAsync("main.js");

  function requireAsync(name, callback) {
    if (!(/\.[^\/]+$/.test(name))) name += ".js";
    load(name, function () {
      var module = requireSync(name);
      if (callback) callback(module);
    }, {});
  }

  function requireSync(name) {
    if (!(/\.[^\/]+$/.test(name))) name += ".js";
    if (name in modules) return modules[name].exports;
    var exports = {};
    if (!(name in defs)) throw new Error("Unknown module " + name);
    var module = modules[name] = {exports:exports};
    if (defs[name].fn(module, exports) !== undefined) throw new Error("Use `module.exports = value`, not `return value`");
    return module.exports;
  }

  // Make sure a module and all it's deps are defined.
  function load(name, callback, chain) {
    // If it's flagged ready, it's ready
    if (ready[name]) return callback();
    // If there is something going on wait for it to finish.
    if (name in pending) return pending[name].push(callback);
    // If the module isn't downloaded yet, start it.
    if (!(name in defs)) return download(name, callback);
    if (chain[name]) return callback();
    chain[name] = true;
    var def = defs[name];
    var missing = def.deps.filter(function (depName) {
      return !ready[depName];
    });
    var left = missing.length;
    if (!left) {
      ready[name] = true;
      return callback();
    }
    return missing.forEach(function (depName) {
      load(depName, onDepLoad, chain);
    });

    function onDepLoad() {
      if (!--left) return load(name, callback, chain);
    }
  }

  function download(name, callback) {
    var script = document.createElement("script");
    script.setAttribute("charset", "utf-8");
    script.setAttribute("src", "src/" + name);
    script.setAttribute("async", true);
    script.addEventListener("error", function () {
      define(name, [], function () {
        throw new Error("Unable to load " + name);
      });
    });
    scripts[name] = script;
    pending[name] = [callback];
    document.head.appendChild(script);
  }

  function define(name, deps, fn) {
    var script = scripts[name];
    if (!script) throw new Error("Name mismatch for " + name);
    delete scripts[name];
    document.head.removeChild(script);
    defs[name] = {
      deps: deps,
      fn: fn
    };
    flush(name);
  }

  function flush(name) {
    var list = pending[name];
    delete pending[name];
    for (var i = 0, l = list.length; i < l; i++) {
      load(name, list[i], {});
    }
  }

})();
