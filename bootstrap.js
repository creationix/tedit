// Tiny AMD loader that auto-loads src/main.js
(function () {
  var modules = {};
  var defs = {};
  var pending = {};
  var scripts = {};
  window.define = define;
  document.body.textContent = "";
  
  load("main", function () {
    console.log("Main loaded");
  });

  function load(name, callback) {
    // Check for cached modules
    if (name in modules) return callback(null, modules[name]);
    // If there is something going on wait for it to finish.
    if (name in pending) return pending[name].push(callback);
    // If the module isn't downloaded yet, start it.
    if (!(name in defs)) return download(name, callback);
    var def = defs[name];
    var missing = def.deps.filter(function (depName) {
      return !(depName in modules);
    });
    var left = missing.length;
    if (left > 0) {
      return missing.forEach(function (depName) {
        load(depName, onDepLoad);
      });
    }
    modules[name] = def.fn.apply(null, def.deps.map(getDep));
    console.log("EXEC", name);
    callback(null, modules[name]);

    function onDepLoad() {
      if (!--left) return load(name, callback);
    }
  }
  
  function getDep(name) {
    return modules[name];
  }
  
  function download(name, callback) {
    var script = document.createElement("script");
    script.setAttribute("charset", "utf-8");
    script.setAttribute("src", "src/" + name + ".js");
    pending[name] = [callback];
    scripts[name] = script;
    document.head.appendChild(script);
  }

  function define(name, deps, fn) {
    console.log("DEFINE", name);
    document.head.removeChild(scripts[name]);
    delete scripts[name];
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
      load(name, list[i]);
    }
  }

})();