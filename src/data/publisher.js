/*global define*/
/*jshint unused:strict,undef:true,trailing:true */
define("data/publisher", function () {
  "use strict";

  var pathJoin = require('lib/pathjoin');
  var modes = require('js-git/lib/modes');
  
  // pathToEntry accepts a path and returns {mode,hash,{tree|link}} in callback
  // handleCommand takes req and returns {etag,{tree|fetch},{mime}}
  // req contains(...TODO: document...)
  return function (pathToEntry, handleCommand) {

    return servePath;
  
    function servePath(path, etag, callback) {
      console.log("servePath", path, etag);
      if (!callback) return servePath.bind(null, path, etag);
      pathToEntry(path, onEntry);
  
      function onEntry(err, entry) {
        if (!entry) return callback(err);
  
        // Trees go straight through
        if (entry.tree) {
          return callback(null, { etag: entry.hash, tree: entry.tree });
        }
  
        // If the request etag matches what's still there, we're done!
        if (etag && etag === entry.hash) {
          return callback(null, {etag:etag});
        }
  
        // Serve files as-is with lazy body.
        if (modes.isFile(entry.mode)) {
          // Static file, serve it as-is.
          return callback(null, {etag: entry.hash, fetch: function (callback) {
            entry.repo.loadAs("blob", entry.hash, callback);
          }});
        }
        
        // Ensure that only symlinks make it past this.
        if (entry.mode !== modes.sym) return callback(new Error("Invalid mode"));
  
        // Symbolic links can have optional filters or wildcard matches.      
        
        var index = entry.link.indexOf("|");
  
        // If not, split out the target, name, and args
        var target = entry.link.substr(0, index);
        var args = entry.link.substr(index + 1).split(" ");
        var name = args.shift();
        var req = {
          path: path,
          etag: etag,
          name: name,
          args: args,
        };
        
        // If there was no target, we're done preparing the request
        if (!target) return handleCommand(req, callback);
  
        // Otherwise, load the entry for the target too.
        // This adds {targetPath,target} to req.
        req.targetPath = pathJoin(path, "..", target);
        return servePath(req.targetPath, null, function (err, target) {
          if (!target) return callback(err);
          req.target = target;
          handleCommand(req, callback);
        });
      }
    }
  };
});
