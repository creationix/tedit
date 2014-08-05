window.addEventListener("load", function () {
  "use strict";
  var defs = {};
  var modules = {};
  var blobUrls = {};
  var loading = {};

  var initQueue = null;
  function initRegenerator(callback) {
    if (initQueue) return initQueue.push(callback);
    var left = 2;
    var done = false;
    initQueue = [callback];
    callback = function () {
      var queue = initQueue;
      initQueue = null;
      for (var i = 0; i < queue.length; i++) {
        queue[i].apply(this, arguments);
      }
    };

    console.log("No native generator support detected, loading regenerator compiler and runtime");
    loadScript("modules/tedit-regenerator/regenerator-bundle.js", function (err, fn) {
      if (err) {
        done = true;
        return callback(err);
      }
      var exports = {};
      var module = {exports:exports};
      fn(module, exports);
      window.regenerator = module.exports;
      if (--left) return;
      done = true;
      callback();
    }, true);
    loadScript("modules/tedit-regenerator/runtime.js", function (err, fn) {
      if (err) {
        done = true;
        return callback(err);
      }
      fn();
      if (--left) return;
      done = true;
      callback();
    }, true);
  }

  requireBase(".").async("./src/main.js", function (err) {
    if (err) throw err;
  });

  function resolve(base, name) {
    var url = name[0] === "." ? pathJoin(base, name) : pathJoin("modules", name);
    if (!/\.js$/i.test(url)) url += ".js";
    return url;
  }

  function requireBase(base) {
    requireSync.async = requireAsync;
    return requireSync;

    function requireSync(name) {
      var url = resolve(base, name);
      if (url in modules) return modules[url].exports;
      var fn = defs[url];
      if (!fn) throw new Error("no such module: " + url);
      var module = modules[url] = {exports:{}};
      return exec(url, module, fn);
    }

    function requireAsync(name, callback) {
      if (!callback) return requireAsync.bind(null, name);
      var url = resolve(base, name);
      if (url in modules) return callback(null, modules[url].exports);
      loadScript(url, function (err, fn) {
        if (url in modules) return callback(null, modules[url].exports);
        var module = modules[url] = {exports:{}};
        if (!fn) throw new Error("No such module: " + url);
        if (err) return callback(err);
        exec(url, module, fn, callback);
      });
    }

    function exec(url, module, fn, callback) {
      var index = url.lastIndexOf("/");
      var dirname = url.substring(0, index);
      var filename = url.substring(index + 1);
      if (fn.constructor === Function) {
        fn(requireBase(dirname), dirname, filename, module, module.exports);
        if (callback) callback(null, module.exports);
      }
      else {
        run(fn(requireBase(dirname), dirname, filename, module, module.exports), function (err, ret) {
          if (err) {
            if (callback) return callback(err);
            throw err;
          }
          if (ret !== undefined) module.exports = ret;
          if (callback) return callback(null, module.exports);
        });
      }
      return module.exports;
    }
  }

  function loadScript(url, callback, raw) {
    if (defs[url]) return callback(null, defs[url]);

    // Guard against concurrent requests for the same resource
    var callbacks = loading[url];
    if (callbacks) return callbacks.push(callback);
    callbacks = loading[url] = [callback];
    callback = function () {
      delete loading[url];
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i].apply(this, arguments);
      }
    };

    readUrl(url, function (err, js) {
      var id = "code://" + url;
      var blobUrl, tag;
      if (js === undefined) return callback(err);
      if (raw) {
        js = "(function (module, exports) {" + js + "})";
        return inject();
      }
      var needgen = /\byield\b/.test(js);
      js = "(function" + (needgen ? "*" : "") +
           " (require, __dirname, __filename, module, exports) {" + js + "})";
      var deps = mine(js);
      if (!deps.length) return inject();
      return preload(url, deps, inject);

      function inject(err) {
        if (err) return callback(err);
        if (needgen && !window.hasgens && !window.regenerator) {
          return initRegenerator(inject);
        }
        js = "window[" + JSON.stringify(id) + "]" + js + ";\n";
        if (needgen && window.regenerator) {
          var index = url.lastIndexOf("/");
          js = window.regenerator(js, {
            sourceFileName: url.substring(index + 1),
            sourceRoot: url.substring(0, index)
          });
        }

        window[id] = define;
        var blob = new Blob([js], {type : 'application/javascript'});
        blobUrl = URL.createObjectURL(blob);
        tag = document.createElement("script");
        tag.setAttribute("charset", "utf-8");
        tag.setAttribute("async", "async");
        tag.setAttribute("src", blobUrl);
        document.head.appendChild(tag);
      }

      function define(fn) {
        if (blobUrls[id]) {
          URL.revokeObjectURL(blobUrls[id]);
        }
        blobUrls[id] = blobUrl;
        delete window[id];
        document.head.removeChild(tag);
        if (!raw) defs[url] = fn;
        callback(null, fn);
      }

    });
  }

  function preload(url, deps, callback) {
    var index = url.lastIndexOf("/");
    var base = url.substring(0, index);
    var left = deps.length;
    var done = false;
    deps.forEach(function (dep) {
      if (done) return;
      loadScript(resolve(base, dep.name), function (err) {
        if (done) return;
        if (err) {
          done = true;
          return callback(err);
        }
        if (!--left) {
          done = true;
          return callback();
        }
      });
    });
  }

  function readUrl(url, callback) {
    var done = false;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.timeout = 2000;
    xhr.ontimeout = onTimeout;
    xhr.onreadystatechange = onReadyStateChange;
    return xhr.send();

    function onReadyStateChange() {
      if (done) return;
      if (xhr.readyState !== 4) return;
      // Give onTimeout a chance to run first if that's the reason status is 0.
      if (!xhr.status) {
        xhr.status = -1;
        return setTimeout(onReadyStateChange, 0);
      }
      done = true;
      if (xhr.status < 200 || xhr.status >= 500) {
        return callback(new Error("Invalid status code for " + url + ": " + xhr.status));
      }
      if (xhr.status > 400) {
        return callback();
      }
      return callback(null, xhr.responseText);
    }

    function onTimeout() {
      if (done) return;
      done = true;
      return callback(new Error("Timeout requesting " + url));
    }
  }

  // from path-join, but inlines for easy use.

  // Joins path segments.  Preserves initial "/" and resolves ".." and "."
  // Does not support using ".." to go above/outside the root.
  // This means that join("foo", "../../bar") will not resolve to "../bar"
  function pathJoin(/* path segments */) {
    // Split the inputs into a list of path commands.
    var parts = [];
    for (var i = 0, l = arguments.length; i < l; i++) {
      if (arguments[i] === undefined || arguments[i] === null) continue;
      parts = parts.concat(arguments[i].split("/"));
    }
    // Interpret the path commands to get the new resolved path.
    var newParts = [];
    for (i = 0, l = parts.length; i < l; i++) {
      var part = parts[i];
      // Remove leading and trailing slashes
      // Also remove "." segments
      if (!part || part === ".") continue;
      // Interpret ".." to pop the last segment
      if (part === "..") newParts.pop();
      // Push new path segments.
      else newParts.push(part);
    }
    // Preserve the initial slash if there was one.
    if (parts[0] === "") newParts.unshift("");
    // Turn back into a single string path.
    return newParts.join("/") || (newParts.length ? "/" : ".");
  }

  // from gen-run, but inlined for easy use.
  function run(generator, callback) {
    var iterator;
    if (typeof generator === "function") {
      // Pass in resume for no-wrap function calls
      iterator = generator(resume);
    }
    else if (typeof generator === "object") {
      // Oterwise, assume they gave us the iterator directly.
      iterator = generator;
    }
    else {
      throw new TypeError("Expected generator or iterator and got " + typeof generator);
    }

    var data = null, yielded = false;

    var next = callback ? nextSafe : nextPlain;

    next();
    check();

    function nextSafe(err, item) {
      var n;
      try {
        n = (err ? iterator.throw(err) : iterator.next(item));
        if (!n.done) {
          if (n.value) start(n.value);
          yielded = true;
          return;
        }
      }
      catch (err) {
        return callback(err);
      }
      return callback(null, n.value);
    }

    function nextPlain(err, item) {
      var cont = (err ? iterator.throw(err) : iterator.next(item)).value;
      if (cont) start(cont);
      yielded = true;
    }

    function start(cont) {
      // Pass in resume to continuables if one was yielded.
      if (typeof cont === "function") return cont(resume());
      // If an array of continuables is yielded, run in parallel
      if (Array.isArray(cont)) {
        for (var i = 0, l = cont.length; i < l; ++i) {
          if (typeof cont[i] !== "function") return;
        }
        return parallel(cont, resume());
      }
      // Also run hash of continuables in parallel, but name results.
      if (typeof cont === "object" && Object.getPrototypeOf(cont) === Object.prototype) {
        var keys = Object.keys(cont);
        for (var i = 0, l = keys.length; i < l; ++i) {
          if (typeof cont[keys[i]] !== "function") return;
        }
        return parallelNamed(keys, cont, resume());
      }
    }

    function resume() {
      var done = false;
      return function () {
        if (done) return;
        done = true;
        data = arguments;
        check();
      };
    }

    function check() {
      while (data && yielded) {
        var err = data[0];
        var item = data[1];
        data = null;
        yielded = false;
        next(err, item);
        yielded = true;
      }
    }

  }

  function parallel(array, callback) {
    var length = array.length;
    var left = length;
    var results = new Array(length);
    var done = false;
    return array.forEach(function (cont, i) {
      cont(function (err, result) {
        if (done) return;
        if (err) {
          done = true;
          return callback(err);
        }
        results[i] = result;
        if (--left) return;
        done = true;
        return callback(null, results);
      });
    });
  }

  function parallelNamed(keys, obj, callback) {
    var length = keys.length;
    var left = length;
    var results = {};
    var done = false;
    return keys.forEach(function (key) {
      var cont = obj[key];
      results[key] = null;
      cont(function (err, result) {
        if (done) return;
        if (err) {
          done = true;
          return callback(err);
        }
        results[key] = result;
        if (--left) return;
        done = true;
        return callback(null, results);
      });
    });
  }

  // From creationix/mine, but inlined for easy use

  // Mine a string for require calls and export the module names
  // Extract all require calls using a proper state-machine parser.
  function mine(js) {
    js = "" + js;
    var names = [];
    var state = 0;
    var ident;
    var quote;
    var name;
    var start;

    var isIdent = /[a-z0-9_.$]/i;
    var isWhitespace = /[ \r\n\t]/;

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
      } else {
        if (isWhitespace.test(char)){
          if (ident !== 'yield' && ident !== 'return'){
            return $ident;
          }
        }
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
      if (char === "\\") {
        return $nameEscape;
      }
      name += char;
      return $name;
    }

    function $nameEscape(char) {
      if (char === "\\") {
        name += char;
      } else {
        name += JSON.parse('"\\' + char + '"');
      }
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

    state = $start;
    for (var i = 0, l = js.length; i < l; i++) {
      state = state(js[i]);
    }
    return names;
  }

});