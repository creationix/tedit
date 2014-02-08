/*global define*/
/*jshint unused:strict,undef:true,trailing:true */
define("publisher", function () {
  "use strict";

  var pathJoin = require('pathjoin');
  var modes = require('modes');
  var pathToEntry = require('repos').pathToEntry;

  return servePath;

  function servePath(path, reqEtag, callback) {
    if (!callback) return servePath.bind(null, path, reqEtag);
    pathToEntry(path, onEntry);

    function onEntry(err, entry, repo) {
      if (!entry) return callback(err);

      // Start out with the hash of the entry for the etag.
      var etag = entry.hash;

      // Send trees back as-is
      if (entry.tree) {
        return callback(null, { etag: etag, tree: entry.tree });
      }

      // If the request etag matches what's still there, we're done!
      if (reqEtag && etag === reqEtag) {
        return callback(null, {etag:etag});
      }

      // Serve files as-is with lazy body.
      if (modes.isFile(entry.mode)) {
        // Static file, serve it as-is.
        return callback(null, {etag: etag, fetch: function (callback) {
          repo.loadAs("blob", entry.hash, callback);
        }});
      }
      
      // Ensure that only symlinks make it past this.
      if (entry.mode !== modes.sym) return callback(new Error("Invalid mode"));

      // Symbolic links can have optional filters or wildcard matches.      
      
      var index = entry.link.indexOf("|");

      // If it's a static symlink, redirect to the target but preserve original.
      if (index < 0) {
        return pathToEntry(pathJoin(path, "..", entry.link), onEntry);
      }

        var target = entry.link.substr(0, index);
        var args = entry.link.substr(index + 1).split(" ");
        var name = args.shift();
        var req = {
          base: base,
          path: path,
          repo: repo,
          root: root,
          etag: reqEtag,
          entry: entry,
          args: args,
          name: name
        };
        if (!target) return repo.handleCommand(req, callback);

        var targetPath = pathJoin(base, target);
        return repo.servePath(root, targetPath, null, function (err, target) {
          if (!target) return callback(err);
          target.path = targetPath;
          req.target = target;
          repo.handleCommand(req, callback);
        });
      }
    }
  }

});
