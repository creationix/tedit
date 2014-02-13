/*global defs, modules*/
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
  js.push("self.onmessage = " + onmessage.toString());
  js = js.join("\n\n");

  var blob = new Blob([js],  { type: "application/javascript" });
  var blobURL = window.URL.createObjectURL(blob);
  var worker = new Worker(blobURL);
  worker.onmessage = function(e) {
    console.log("MESSAGE FROM WORKER", e.data);
  };
  return function (servePath, req, callback) {
    console.log("req", req)
    worker.postMessage({req:req});

  }
}

function _require(name) {
  if (name in modules) return modules[name];
  if (!(name in defs)) throw new Error("Invalid require " + name);
  var exports = {};
  var module = modules[name] = { exports: exports };
  defs[name](module, exports);
  modules[name] = module.exports;
  return module.exports;
}

function onmessage(evt) {
  var mod = _require("main");
  console.log("MESSAGE FROM MASTER: " + evt.data);
}
