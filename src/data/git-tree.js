"use strict";

var modes = require('js-git/lib/modes');
var binary = require('bodec');
var jonParse = require('data/jon-parser').parse;
var carallel = require('carallel');
var pathJoin = require('pathjoin');

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
    path = parts.join("/");
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

          if (bake && (entry.mode === modes.sym)) {
             if (!check("blob", entry.hash)) return;
             var blob = storage.get(entry.hash);
             var link = binary.toUnicode(blob);
             var rest = parts.slice(index + 1).join("/");
             var linkPath = pathJoin(partial, link, rest);
             return resolvePath(linkPath, bake, callback);
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

    function loadRule(path, rule, callback) {
      if (!callback) return loadRule.bind(null, path, rule);
      return storage.loadAs(rule.root, "blob", rule.hash, function (err, blob) {
        if (err) return callback(err);
        if (blob === undefined) return callback(new Error("Missing blob " + rule.hash));
        var data;
        try {
          var jon = binary.toUnicode(blob);
          data = jonParse(jon);
        }
        catch (err) {
          err.message += "\nin " + rule.path + ".rule";
          err.path = rule.path + ".rule";
          return callback(err);
        }
        data.paths = {
          full: path,
          local: rule.path ? path.substring(rule.path.length + 1) : path,
          rule: rule.path,
          root: root
        };
        bake(data, callback);
      });
    }

    // The target entry was not found, this searches to see if any rules
    // generate the path.
    function searchRules() {
      return next();

      function next() {
        var rule = rules.pop();
        if (!rule) return done(false);
        loadRule(path, rule, onHandled);
      }

      function onHandled(err, result) {
        if (err) return callback(err);
        if (!(result && result.hash)) return next();
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
      }
      if (callback) return callback(null, entry);
      return entry;
    }

    function loadOverlays(overlays, callback) {
      carallel(rules.map(function (rule) {
        return loadRule(path, rule);
      }), function (err, entries) {
        if (err) return callback(err);

        entries.forEach(function (entry, i) {
          if (!entry) return;
          entry.rule = rules[i];
          overlays.push(entry);
        });
        callback();
      });
    }

    function applyOverlays(tree, overlays, callback) {
      var local = {};
      // Rename local rules.
      Object.keys(tree).forEach(function (key) {
        var entry = tree[key];
        if (entry.mode !== modes.exec || !/\.rule$/.test(key)) return;
        delete tree[key];
        var childPath = path ? path + "/" + key : key;
        var childRule = {
          path: childPath,
          root: root,
          hash: entry.hash
        };
        key = key.substring(0, key.length - 5);
        local[key] = loadRule(childPath, childRule);
      });

      carallel(local, function (err, results) {
        if (err) return callback(err);
        Object.keys(results).forEach(function (key) {
          if (!tree[key]) {
            var entry = results[key];
            tree[key] = {
              mode: entry.mode,
              hash: entry.hash
            };
          }
        });
        next();
      });

      function next() {
        var overlay;
        do {
          overlay = overlays.pop();
          if (!overlay) {
            return callback(null, tree);
          }
        } while (overlay.mode !== modes.tree);
        overlay.fetch(onTree);
      }

      function onTree(err, extra) {
        if (err) return callback(err);
        Object.keys(extra).forEach(function (key) {
          if (!tree[key]) tree[key] = extra[key];
        });
        next();
      }
    }

  }

};
