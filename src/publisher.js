/*global define*/
define("publisher", function () {
  "use strict";

  var pathJoin = require('js-linker/pathjoin.js');
  var modes = require('modes');

  return function (repo) {
    repo.servePath = servePath;
  };

  // Options can be "etag" and "head".
  // If path is invalid (nothing is there), callback()
  // If there is an error, callback(err)
  // Otherwise callback(null, etag, fetch(cb))
  //   Where fetch's callback returns the body or error.
  // If the path is close (require a redirect) callback({location});
  function servePath(root, path, reqEtag, callback) {
    var repo = this;
    if (!callback) return servePath.bind(repo, root, path, reqEtag);
    repo.pathToEntry(root, path, onEntry);

    function onEntry(err, entry) {
      if (!entry) return callback(err);

      var etag;
      if (modes.isTree(entry.mode)) etag = 'W/"' + entry.hash + '"';
      else if (modes.isFile(entry.mode)) etag = '"' + entry.hash + '"';

      if (reqEtag && etag === reqEtag) {
        return callback(null, {etag:etag});
      }
      if (modes.isTree(entry.mode)) {
        // Directory
        if (path[path.length - 1] !== "/") {
          // Redirect if trailing slash is missing
          return callback(null, {redirect: path + "/"});
        }
        // Auto-load index.html pages using internal redirect
        if (entry.tree["index.html"]) {
          path = pathJoin(path, "index.html");
          return callback(null, {internalRedirect: path});
        }
        // Render tree as JSON listing.
        return callback(null, { etag: etag, mime: "application/json", fetch: function (callback) {
          callback(null, JSON.stringify(entry.tree) + "\n");
        }});
      }
      if (modes.isFile(entry.mode)) {
        // Static file, serve it as-is.
        return callback(null, {etag: etag, fetch: function (callback) {
          repo.loadAs("blob", entry.hash, callback);
        }});
      }
      if (modes.isSymLink(entry.mode)) {
        // Symbolic Link, execute the filter if any
        var index = entry.link.indexOf("|");
        var base = pathJoin(path, "..");

        // If it's a static symlink, redirect to the target but preserve the
        // original path.
        if (index < 0) {
          return repo.pathToEntry(root, pathJoin(base, entry.link), onEntry);
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
