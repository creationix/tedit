/*global defs, modules, self*/
var mine = require('mine');

// Compile cjs formatted code in a web worker and return
module.exports = function (code) {
  var js = [];
  mine(code).forEach(function (dep) {
    var name = dep.name;
    if (!(/\.[^\/]+$/.test(name))) name += ".js";
    var def = defs[name];
    if (def.deps.length) throw new Error("Complex deps " + name);
    var fn = def.fn;
    js.push("defs[" + JSON.stringify(dep.name) + "] = " + fn.toString() + ";");
  });
  js.push("defs.main = function (module, exports) {\n" + code + "\n};");
  if (js.length) {
    js.unshift("var require = _require;");
    js.unshift(_require.toString());
    js.unshift("var defs = {}, modules = {};");
  }
  js.push(genRPC.toString());
  js.push("var rpc = genRPC(self, require('main'));");
  js = js.join("\n\n");

  var blob = new Blob([js],  { type: "application/javascript" });
  var blobURL = window.URL.createObjectURL(blob);
  var worker = new Worker(blobURL);
  return genRPC(worker);
};

function _require(name) {
  if (name in modules) return modules[name];
  if (!(name in defs)) throw new Error("Invalid require " + name);
  var exports = {};
  var module = modules[name] = { exports: exports };
  defs[name](module, exports);
  modules[name] = module.exports;
  return module.exports;
}

// mini RPC system to communicate with the worker.
// This code is shared by both sides.
// Serialized functions don't support return values or `this`, use callbacks.
function genRPC(worker, main) {
  var nextId = 1;
  var functions = [];
  var callbacks = {};
  var me = self === worker ? "worker" : "master";

  worker.onmessage = onmessage;

  return function request() {
    send(0, arguments);
  };

  function send(id, args) {
    var message = [id, Array.prototype.map.call(args, freezeArg)];
    // console.log(me + " out " + JSON.stringify(message));
    worker.postMessage(message);
  }

  function freezeArg(arg, i, args) {
    return freeze(arg, i < args.length - 1);
  }

  // Freeze functions in a message by turning them into numbered tokens
  function freeze(value, permanent) {
    var type = typeof value;
    if (type === "function") {
      if (permanent) {
        var index = functions.indexOf(value);
        if (index < 0) {
          index = functions.length;
          functions.push(value);
        }
        return {$: -1 - index};
      }
      var id = (nextId++).toString(36);
      callbacks[id] = value;
      return {$:id};
    }
    if (Array.isArray(value)) {
      return value.map(freeze);
    }
    if (value && type === "object") {
      if (value.constructor.name === "Uint8Array") {
        return value;
      }
      var object = {};
      for (var key in value) {
        object[key] = freeze(value[key]);
      }
      return object;
    }
    return value;
  }

  function onmessage(evt) {
    // console.log(me + " in " + JSON.stringify(evt.data));
    var id = parseInt(evt.data[0], 36);
    var args = thaw(evt.data[1]);
    var fn;
    if (id < 0) fn = functions[1 - id];
    else if (id > 0) {
      fn = callbacks[evt.data[0]];
      if (!fn) {
        console.warn("missing callback " + id);
        return;
      }
      delete callbacks[id];
    }
    else fn = main;
    fn.apply(null, args);
  }

  // Turn numbered tokens into proxy functions that call the remote side
  function thaw(value) {
    if (Array.isArray(value)) {
      return value.map(thaw);
    }
    if (value && typeof value === "object") {
      if (value.constructor.name === "Uint8Array") {
        return value;
      }
      if (value.$) {
        return proxy(value.$);
      }
      var object = {};
      for (var name in value) {
        object[name] = thaw(value[name]);
      }
      return object;
    }
    return value;
  }

  function proxy(id) {
    return function proxyFunction() {
      send(id, arguments);
    };
  }

}
