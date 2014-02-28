"use strict";

var modes = require('js-git/lib/modes');
var binary = require('bodec');
var jonParse = require('data/jon-parser').parse;

module.exports = function (storage) {
  // storage provides the following interface
  //
  // storage.has(hash) -> boolean
  // storage.get(hash) -> value
  // storage.getRootHash() -> hash
  // storage.loadAs(root, type, hash) => value, hash
  // storage.hasGitmodules(root, hash) -> boolean
  // storage.storeGitmodules(root, hash) =>
  // storage.hasRepo(root) -> boolean
  // storage.initializeRepo(root, hash, path) =>

  return resolvePath;
  // In raw mode, resolve paths to {mode,hash,root} entries
  // In baked mode resolve to {mode,hash,root,[mime],fetch} where fetch accepts
  // a callback that results in (string|binary|tree|virtualTree)
  // If no callback is provided, return entry or throw if data is missing.
  // bake is a function (passed in for bake mode): bake(req) => bakedRes
  function resolvePath(path, bake, callback) {
    var mode = modes.commit;
    var hash = storage.getRootHash();
    var root = "";

    var parts = path.split("/").filter(Boolean);
    var index = 0;
    var partial = "";

    // In baked mode, we need to remember tree rules.
    var rules = bake ? [] : null;

    // Start the walk loop.
    return walk();

    function walk() {
      while (index < parts.length) {
        // When a commit node is found (submodule), enter it's tree.
        if (mode === modes.commit) {
          // Make sure we have the commit already cached.
          if (!check("commit", hash)) return;
          // transition into the tree
          mode = modes.tree;
          hash = storage.get(hash).tree;
        }

        // When a tree is found, check it's contents for the next path segment.
        if (mode === modes.tree) {

          // Make sure the tree is cached before doing anything else.
          if (!check("tree", hash)) return;

          var tree = storage.get(hash);

          if (root === partial) {
            // If the tree is at a root, also make sure it's .gitmodules data is
            // already cached.
            var modulesEntry = tree[".gitmodules"];
            var modulesHash = modulesEntry && modulesEntry.hash;
            if (!storage.hasGitmodules(root, modulesHash)) {
              if (callback) {
                return storage.storeGitmodules(root, modulesHash, onLoad);
              }
              throw new Error("Unable to update .gitmodules cache '" + root + "'");
            }
          }

          var part = parts[index];
          var entry = tree[part];
          var newPath = partial ? partial + "/" + part : part;

          // If the child is a commit, make sure it's initialized
          if (entry && entry.mode === modes.commit) {
            if (!storage.hasRepo(newPath)) {
              if (callback) {
                return storage.initializeRepo(root, entry.hash, newPath, onLoad);
              }
              throw new Error("Missing repo at '" + newPath + "'");
            }
          }

          // When in baked mode, always be looking for executable rule entries.
          var ruleEntry = tree[part + ".rule"];
          if (bake && ruleEntry && ruleEntry.mode === modes.exec) {
            // Remember them for future reference.
            rules.push({
              path: newPath,
              root: root,
              hash: ruleEntry.hash
            });
          }

          if (!entry) {
            // If you get here, the entry didn't match
            // In raw-mode this is a no-find.
            if (!bake) break;
            // In bake mode, look for rule that may serve this path.
            return searchRules();
          }

          if (entry.mode === modes.sym) {
            throw "TODO: Implement symlink resolving";
          }

          // We're good, move on!
          mode = entry.mode;
          hash = entry.hash;
          partial = newPath;
          if (mode === modes.commit) root = partial;
          index++;
        }
      }

      return done(index >= parts.length);
    }

    function searchRules() {
      var overlay, localPath;
      path = parts.join("/");
      return next();

      function next() {
        overlay = rules.pop();
        if (!overlay) return done(false);
        localPath = overlay.path ? path.substring(overlay.path.length + 1) : path;
        return storage.loadAs(overlay.root, "blob", overlay.hash, onBlob);
      }

      function onBlob(err, blob) {
        if (blob === undefined) return callback(err || new Error("Missing blob " + overlay.hash));
        var data;
        try {
          var jon = binary.toUnicode(blob);
          data = jonParse(jon);
        }
        catch (err) { return callback(err); }
        data.paths = {
          full: path,
          local: localPath,
          rule: overlay.path,
          root: root
        };
        return bake(data, onHandled);
      }

      function onHandled(err, result) {
        if (err) return callback(err);
        if (!result) return next();
        return callback(null, result);
      }

    }

    function check(type, hash) {
      // Make sure we have the value already cached.
      if (storage.has(hash)) return true;
      if (callback && root !== undefined) {
        storage.loadAs(root, type, hash, onLoad);
        return false;
      }
      throw new Error("Missing " + type + " at '" + partial + "'");
    }

    // Generic callback to check for loading errors and resume the loop.
    function onLoad(err) {
      if (err) return callback(err);
      return walk();
    }

    function done(found) {
      var entry = { root: root };
      // In raw mode, simple send the result back
      if (!bake) {
        if (found) {
          entry.hash = hash;
          entry.mode = mode;
        }
      }
      else {
        if (found) {

          // Resolve commits to be trees
          if (mode === modes.commit) {
            if (!check("commit", hash)) return;
            mode = modes.tree;
            hash = storage.get(hash).tree;
          }

          // Serve the static blob or tree
          var type = modes.toType(mode);
          entry.hash = hash;
          entry.mode = mode;
          var overlays = [];
          entry.fetch = function (callback) {
            storage.loadAs(root, type, hash, function (err, result) {
              if (err) return callback(err);
              if (entry.mode === modes.tree && overlays.length) {
                return applyOverlays(result, overlays, callback);
              }
              callback(null, result);
            });
          };
          if (entry.mode === modes.tree && rules.length) {
            return loadOverlays(overlays, function (err) {
              if (err) return callback(err);
              callback(null, entry);
            });
          }
        }
        else {
          throw "TODO: Implement baked output";
        }
      }
      if (callback) return callback(null, entry);
      return entry;
    }

    function loadOverlays(overlays, callback) {
      throw "TODO: loadOverlays";
      // Run all rules in parallel to get the etags for those who affect path
    }

    function applyOverlays(tree, overlays, callback) {
      throw "TODO: applyOverlays";
      // Run all the fetchs in parallel and merge tree results
    }

  }

};
