/*global define, chrome*/
/*jshint unused:strict,undef:true,trailing:true */
define("data/live", function () {

  var fileSystem = chrome.fileSystem;
  var fail = require('ui/fail');
  var pathJoin = require('lib/pathjoin');
  var pathToEntry = require('data/repos').pathToEntry;
  var publisher = require('data/publisher');
  var binary = require('js-git/lib/binary');

  var memory = {};

  return {
    addExportHook: addExportHook
  };

  function addExportHook(node, settings) {
    var rootEntry;
    var servePath = publisher(pathToEntry, handleFilter);
    var dirty = null;
    node.pulse = true;
    fileSystem.restoreEntry(settings.entry, function (entry) {
      if (!entry) fail(node, new Error("Failed to restore entry"));
      rootEntry = entry;
      node.pulse = false;
      hook(node);
    });

    return hook;

    function hook(node) {
      // If it's busy doing an export, put the node in the dirty queue
      if (node.pulse) {
        dirty = node;
        return;
      }
      node.exportPath = rootEntry.fullPath + "/" + settings.name;

      // Mark the process as busy
      node.pulse = true;
      console.log("Export Start");
      
      // Run the export script
      exportPath(settings.source, settings.name, rootEntry, onExport, onFail);

      function onExport() {
        node.pulse = false;
        console.log("Export Done");
        // If there was a pending request, run it now.
        if (dirty) {
          var newNode = dirty;
          dirty = null;
          hook(newNode);
        }
      }
      
      function onFail(err) {
        node.pulse = false;
        fail(node, err);
      }

    }
      

    function exportPath(path, name, dir, onSuccess, onError) {
      var etag = memory[path];
      servePath(path, etag, onResult);
      
      function onResult(err, result) {
        if (!result) return onError(err || new Error("Can't find " + path));
        // Always walk trees because there might be symlinks under them that point
        // to changed content without  the tree's content actually changing.
        if (result.tree) return exportTree(path, name, dir, result.tree, onSuccess, onError);
        // If the etags match, it means we've already exported this version of this path.
        if (etag && result.etag === etag) {
          console.log("Skipping", path, etag)
          return onSuccess();
        }
        // Mark this as being saved.
        memory[path] = result.etag;
        result.fetch(onBody);
      }

      function onBody(err, body) {
        if (body === undefined) return onError(err || new Error("Problem fetching response body"));
        return exportFile(name, dir, body, onSuccess, onError);
      }
    }
    
    function exportTree(path, name, dir, tree, onSuccess, onError) {
      // Create the directoy
      dir.getDirectory(name, {create: true}, onDir, onError);

      function onDir(dirEntry) {
        // Export it's children.
        exportChildren(path, tree, dirEntry, onSuccess, onError);
      }
    }
    
    function exportChildren(base, tree, dir, onSuccess, onError) {
      var names = Object.keys(tree);
      check();
      
      function check() {
        var name = names.shift();
        if (!name) {
          return onSuccess();
        }
        exportPath(base + "/" + name, name, dir, check, onError);
      }
    }

    function exportFile(name, dir, body, onSuccess, onError) {
      // Flag for onWriteEnd to know state
      var truncated = false;
      
      // Create the file
      dir.getFile(name, {create:true}, onFile, onError);

      // Create a writer for the file
      function onFile(file) {
        file.createWriter(onWriter, onError);
      }
  
      // Setup the writer and start the write
      function onWriter(fileWriter) {
        fileWriter.onwriteend = onWriteEnd;
        fileWriter.onerror = onError;
        fileWriter.write(new Blob([body]));
      }

      // This gets called twice.  The first calls truncate and then comes back.
      function onWriteEnd() {
        if (truncated) return onSuccess();
        truncated = true;
        // Trim any extra data leftover from a previous version of the file.
        this.truncate(this.position);
      }
    }

    function handleFilter(req, callback) {
      if (name === "amd") return amd(servePath, req, callback);
      return callback(new Error("Unknown filter handler " + req.name));
    }
  }

  function amd(servePath, req, callback) {
    return callback(null, {etag: req.etag + "-amd", fetch: fetch});
    
    function fetch(callback) {
      req.target.fetch(function (err, js) {
        if (err) return callback(err);
        js = binary.toUnicode(js);
        var base = pathJoin(req.targetPath, "..");
        var deps = mine(js);
        var length = deps.length;
        var paths = new Array(length);
        for (var i = length - 1; i >= 0; i--) {
          var dep = deps[i];
          var depPath = pathJoin(base, dep.name);
          paths[i] = depPath;
          js = js.substr(0, dep.offset) + depPath + js.substr(dep.offset + dep.name.length);
        }
        js = "define(" + JSON.stringify(req.targetPath) + ", " +
            JSON.stringify(paths) + ", function (module, exports) {\n" +
            js + "\n});\n";
        console.log(js);
        callback(null, js);
      });
    }
  
  }

  function mine(js) {
    var names = [];
    var state = 0;
    var ident;
    var quote;
    var name;
    var start;
  
    var isIdent = /[a-z0-9_.]/i;
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
  
    function $escape(char) {
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
  
    var state = $start;
    for (var i = 0, l = js.length; i < l; i++) {
      state = state(js[i]);
    }
    return names;
  }


});