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

  requireAsync("main.js");

  function requireAsync(name, callback) {
    if (!(/\.[^\/]+$/.test(name))) name += ".js";
    load("", name, function () {
      var module = requireSync(name);
      if (callback) callback(module);
    });
  }

  function requireSync(name) {
    if (!(/\.[^\/]+$/.test(name))) name += ".js";
    if (name in modules) return modules[name].exports;
    var exports = {};
    var module = modules[name] = {exports:exports};
    if (defs[name].fn(module, exports) !== undefined) throw new Error("Use `module.exports = value`, not `return value`");
    return module.exports;
  }

  // Make sure a module and all it's deps are defined.
  function load(parentName, name, callback) {
    // If it's flagged ready, it's ready
    if (ready[name]) return callback();
    // If there is something going on wait for it to finish.
    if (name in pending) return pending[name].push(callback);
    // If the module isn't downloaded yet, start it.
    if (!(name in defs)) return download(parentName, name, callback);
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
      load(name, depName, onDepLoad);
    });

    function onDepLoad() {
      if (!--left) return load(parentName, name, callback);
    }
  }

  function download(parentName, name, callback) {
    var script = document.createElement("script");
    script.setAttribute("charset", "utf-8");
    script.setAttribute("src", "src/" + name);
    script.setAttribute("async", true);
    script.addEventListener("error", function () {
      console.error("Error loading " + name + " required by " + parentName);
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
      load("", name, list[i]);
    }
  }

})();