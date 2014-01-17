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
  document.body.textContent = "";

  requireAsync("main");

  function requireAsync(name, callback) {
    load(name, function () {
      var module = requireSync(name);
      if (callback) callback(module);
    });
  }

  function requireSync(name) {
    if (name in modules) return modules[name];
    var module = modules[name] = defs[name].fn();
    return module;
  }

  // Make sure a module and all it's deps are defined.
  function load(name, callback) {
    // If it's flagged ready, it's ready
    if (ready[name]) return callback();
    // If there is something going on wait for it to finish.
    if (name in pending) return pending[name].push(callback);
    // If the module isn't downloaded yet, start it.
    if (!(name in defs)) return download(name, callback);
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
      load(depName, onDepLoad);
    });

    function onDepLoad() {
      if (!--left) return load(name, callback);
    }
  }


  function download(name, callback) {
    var script = document.createElement("script");
    script.setAttribute("charset", "utf-8");
    script.setAttribute("src", "src/" + name + ".js");
    script.setAttribute("async", true);
    scripts[name] = script;
    pending[name] = [callback];
    document.head.appendChild(script);
  }

  function pullName(entry) {
    return entry.name;
  }

  function define(name, fn) {
    var script = scripts[name];
    delete scripts[name];
    document.head.removeChild(script);
    var deps = mine(fn.toString()).map(pullName);
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

  function mine(js) {
    var names = [];
    var ident;
    var quote;
    var name;
    var start;

    var isIdent = /[a-z0-9_.]/i;
    var isWhitespace = /[ \r\n\t]/;

    var state = $start;
    for (var i = 0, l = js.length; i < l; i++) {
      state = state(js[i]);
    }
    return names;

    function $start(char) {
      if (char === "/") {
        return $slash;
      }
      if (char === "'" || char === '"') {
        quote = char;
        return $string;
      }
      if (isIdent.test(char)) {
        ident = char;
        return $ident;
      }
      return $start;
    }

    function $ident(char) {
      if (isIdent.test(char)) {
        ident += char;
        return $ident;
      }
      if (char === "(" && ident === "require") {
        ident = undefined;
        return $call;
      }
      return $start(char);
    }

    function $call(char) {
      if (isWhitespace.test(char)) return $call;
      if (char === "'" || char === '"') {
        quote = char;
        name = "";
        start = i + 1;
        return $name;
      }
      return $start(char);
    }

    function $name(char) {
      if (char === quote) {
        return $close;
      }
      name += char;
      return $name;
    }

    function $close(char) {
      if (isWhitespace.test(char)) return $close;
      if (char === ")" || char === ',') {
        names.push({
          name: name,
          offset: start
        });
      }
      name = undefined;
      return $start(char);
    }

    function $string(char) {
      if (char === "\\") {
        return $escape;
      }
      if (char === quote) {
        return $start;
      }
      return $string;
    }

    function $escape() {
      return $string;
    }

    function $slash(char) {
      if (char === "/") return $lineComment;
      if (char === "*") return $multilineComment;
      return $start(char);
    }

    function $lineComment(char) {
      if (char === "\r" || char === "\n") return $start;
      return $lineComment;
    }

    function $multilineComment(char) {
      if (char === "*") return $multilineEnding;
      return $multilineComment;
    }

    function $multilineEnding(char) {
      if (char === "/") return $start;
      if (char === "*") return $multilineEnding;
      return $multilineComment;
    }

  }

})();