/*global define*/
/*jshint unused:strict,undef:true,trailing:true */
define("repos", function () {

  var prefs = require('prefs');
  var treeConfig = prefs.get("treeConfig", {});
  var parseConfig = require('js-git/lib/config-codec').parse;
  var encodeConfig = require('js-git/lib/config-codec').encode;
  var importEntry = require('importfs');
  var clone = require('clone');
  var modes = require('js-git/lib/modes');
  var pathJoin = require('pathjoin');
  var repos = {};

  return {
    mapRootNames: mapRootNames,
    loadConfig: loadConfig,
    createEmpty: createEmpty,
    createFromFolder: createFromFolder,
    createClone: createClone,
    createGithubMount: createGithubMount,
    splitPath: splitPath,
    genName: genName,
    addSubModule: addSubModule,
    pathToEntry: pathToEntry,
  };

  // Map the names ot the root repos (useful for rendering a tree)
  function mapRootNames(callback) {
    return Object.keys(treeConfig).filter(function (path) {
      return path.indexOf("/") < 0;
    }).map(function (name) {
      return callback(name);
    });
  }

  function addSubModule(path, config, url, localPath, name, callback) {
    callback = singleCall(callback);
    var childConfig, childRepo, childHead;
    var meta;
    var repo = repos[path];
    repo.loadAs("commit", config.current, onCurrent);

    function onCurrent(err, commit) {
      if (err) return callback(err);
      repo.pathToEntry(commit.tree, localPath, onTreeEntry);
      repo.loadAs("tree", commit.tree, onTree);
    }

    function onTree(err, tree) {
      if (err) return callback(err);
      var entry = tree[".gitmodules"];
      if (entry && modes.isFile(entry.mode)) repo.loadAs("text", entry.hash, onText);
      else {
        meta = {};
        join();
      }
    }

    function onTreeEntry(err, entry) {
      if (err) return callback(err);
      name = genName(name || url, entry.tree);
      localPath = localPath ? localPath + "/" + name : name;
      path += "/" + localPath;
      childConfig = treeConfig[path] = configFromUrl(url, config);
      childRepo = repos[path] = createRepo(childConfig);
      loadConfig(path, null, onConfig);
      join();
    }

    function onConfig(err) {
      if (err) return callback(err);
      childHead = config.head || config.current;
      join();
    }

    function onText(err, text) {
      if (err) return callback(err);
      try { meta = parseConfig(text); }
      catch (err) { return callback(err); }
      join();
    }

    function join() {
      if (!meta || !childHead) return;
      if (!meta.submodule) meta.submodule = {};
      meta.submodule[localPath] = {
        path: localPath,
        url: url
      };
      callback(null, [
        { path: ".gitmodules",
          mode: modes.blob,
          content: encodeConfig(meta)
        },
        { path: localPath,
          mode: modes.commit,
          hash: childHead
        }
      ]);
    }
  }

  // Load a config by path.  This will load any missing information, clone new
  // repos, import entries, lookup submodule urls, etc.  The hash property is to
  // override the "current" hash (for example in submodules).
  function loadConfig(path, hash, callback) {
    var config, repo;
    if (treeConfig[path]) return onConfig(null, treeConfig[path]);
    return loadSubmoduleConfig(path, onConfig);

    function onConfig(err, result) {
      if (err) return callback(err);
      config = result;
      if (!treeConfig[path]) {
        treeConfig[path] = config;
      }
      if (hash) config.current = hash;
      repo = repos[path] || (repos[path] = createRepo(config));
      if (config.head) return onHead();
      return repo.readRef("refs/heads/master", onHead);
    }

    function onHead(err, hash) {
      if (err) return callback(err);
      if (hash) config.head = hash;
      if (config.current) return onCurrent();
      return repo.readRef("refs/tags/current", onCurrent);
    }

    function onCurrent(err, hash) {
      if (err) return callback(err);
      if (hash) config.current = hash;
      if (!config.current) {
        if (config.head) config.current = config.head;
        else if (config.url) return clone(repo, config, onHead);
        else if (config.entry) return importEntry(repo, config.entry, onTree);
        else return initEmpty(repo, null, onCurrent);
      }
      prefs.save();
      var pair = {
        repo: repo,
        config: config
      };
      callback(null, pair);
    }

    function onTree(err, hash) {
      if (err) return callback(err);
      initEmpty(repo, hash, onCurrent);
    }

  }

  function createEmpty(name) {
    name = genName(name, treeConfig);
    treeConfig[name] = configFromUrl();
    prefs.save();
    return name;
  }

  function createFromFolder(entry, name) {
    name = genName(name || entry.name, treeConfig);
    treeConfig[name] = { entry: entry };
    return name;
  }

  function createClone(url, name) {
    name = genName(name || url, treeConfig);
    treeConfig[name] = configFromUrl(url);
    prefs.save();
    return name;
  }

  function createGithubMount(path, name) {
    name = genName(name || path, treeConfig);
    treeConfig[name] = { githubName: path };
    prefs.save();
    return name;
  }

  // Given a global path, return {repo:repo,config:config}
  function splitPath(path) {
    var root;
    if (treeConfig[path]) {
      root = path;
      path = "";
    }
    else {
      root = findRoot(path);
      path = path.substring(root.length + 1);
    }
    return {
      root: root,
      path: path,
      repo: repos[root],
      config: treeConfig[root]
    };
  }



  // Given a global path, find the path to the nearest repo.
  function findRoot(path) {
    // Find the longest
    var parentPath = "";
    Object.keys(treeConfig).forEach(function (name) {
      if (name.length > path.length) return;
      if (name !== path.substr(0, name.length)) return;
      if (name.length > parentPath.length) parentPath = name;
    });
    if (!parentPath) throw new Error("Can't find containing repo for " + path);
    return parentPath;
  }


  function createRepo(config) {
    var repo = {};
    if (config.githubName) {
      var githubToken = prefs.get("githubToken", "");
      require('js-git/mixins/github-db')(repo, config.githubName, githubToken);
      // Github has this built-in, but it's currently very buggy
      require('js-git/mixins/create-tree')(repo);
      // Cache github objects locally in indexeddb
      require('js-git/mixins/add-cache')(repo, require('js-git/mixins/indexed-db'));
    }
    else {
      if (!config.prefix) {
        config.prefix = Date.now().toString(36) + "-" + (Math.random() * 0x100000000).toString(36);
      }
      require('js-git/mixins/indexed-db')(repo, config.prefix);
      require('js-git/mixins/create-tree')(repo);
    }
    // Combine concurrent read requests for the same hash
    require('js-git/mixins/read-combiner')(repo);

    // Add delay to all I/O operations for debugging
    // require('delay')(repo, 300);
    
    // Add format munging to add two new virtual types "array" and "text"
    require('js-git/mixins/formats')(repo);
    return repo;
  }

  // global-path based pathToEntry
  function pathToEntry(path, callback) {
    var mode, hash, repo, rootPath, parts;

    // strip extra leading and trailing slashes
    path = path.split("/").filter(Boolean).join("/");
    
    start();
    
    function start() {
      try {
        // Find the nearest known repo root
        rootPath = findRoot(path);
        parts = path.substring(rootPath.length + 1).split("/");
        path = rootPath;
        repo = repos[rootPath];
        var config = treeConfig[rootPath];
        // Read the commit to find root tree
        return repo.loadAs("commit", config.current, onCommit);
      }
      catch (err) { return callback(err); }
    }

    function onCommit(err, commit, hash) {
      if (!commit) return callback(err || new Error("Missing commit " + hash));
      mode = modes.tree;
      hash = commit.tree;
      repo.loadAs("tree", hash, onTree);
    }

    function onTree(err, tree) {
      if (!tree) return callback(err || new Error("Missing tree " + entry.hash));
      if (!parts.length) return done({tree:tree});
      var name = parts.shift();
      var entry = tree[name];
      if (!entry) return callback();
      mode = entry.mode;
      hash = entry.hash;
      if (mode === modes.tree) {
        path += "/" + name;
        return repo.loadAs("tree", hash, onTree);
      }
      if (entry.mode === modes.sym) {
        return repo.loadAs("text", entry.hash, onSym);
      }
      if (entry.mode === modes.commit) {
        console.log("TODO: COMMIT", {
          path: path,
          name: name,
          parts: parts,
          entry: entry
        });
        throw new Error("TODO: handle loading submodules");
      }
      return done({});
    }
    
    function onSym(err, link) {
      if (link === undefined) return callback(err || new Error("Missing symlink " + hash));
      if (!parts.length && link.indexOf("|") >= 0) {
        return done({link:link});
      }
      return pathToEntry(pathJoin(path, link, parts.join("/")), callback);
    }
    
    function done(entry) {
      entry.mode = mode;
      entry.hash = hash;
      entry.repo = repo;
      entry.path = path;
      entry.localPath = path.substring(rootPath.length + 1);
      // TODO: remove repo arg once code has been uddated to get it from entry
      callback(null, entry, repo);
    }
  }
  
  function initEmpty(repo, tree, callback) {
    if (tree) return onTree(null, tree);
    return repo.saveAs("tree", [], onTree);

    function onTree(err, hash) {
      if (err) return callback(err);
      return repo.saveAs("commit", {
        tree: hash,
        author: {
          name: "AutoInit",
          email: "tedit@creationix.com"
        },
        message: "Initial Empty Commit"
      }, callback);
    }
  }

  // Generates a good unique root name from an almost arbitrary string.
  function genName(string, obj) {
    var base = string.substring(string.lastIndexOf("/") + 1).replace(/\.git$/, "").replace(/[!@#%\^&*()\\|+=[\]~`,<>?:;"']+/gi, " ").trim() || "unnamed";
    var name = base;
    var i = 1;
    while (name in obj) {
      name = base + "-" + (++i);
    }
    return name;
  }

  function checker(callback) {
    var done = false;
    return function (continuation) {
      if (done) return;
      return function (err) {
        if (done) return;
        if (!continuation) {
          done = true;
          return callback.apply(null, arguments);
        }
        if (err) {
          done = true;
          return callback(err);
        }
        try {
          return continuation.apply(null, Array.prototype.slice.call(arguments, 1));
        }
        catch (err) {
          if (done) return;
          return callback(err);
        }
      };
    };
  }

  function loadSubmoduleConfig(path, callback) {
    var check = checker(callback);
    var repo, rootPath, localPath, url;
    return check(start)();

    function start() {
      rootPath = findRoot(path);
      localPath = path.substring(rootPath.length + 1);
      return pathToEntry(rootPath + "/.gitmodules", check(onEntry));
    }

    function onEntry(entry, result) {
      if (!entry || !modes.isFile(entry.mode)) throw new Error("Missing .gitmodules file");
      repo = result;
      return repo.loadAs("text", entry.hash, check(onFile));
    }

    function onFile(text) {
      var meta = parseConfig(text);
      for (var key in meta.submodule) {
        var item = meta.submodule[key];
        if (item.path !== localPath) continue;
        url = item.url;
        break;
      }
      if (!url) {
        throw new Error("Missing submodule " + localPath + " in .gitmodules");
      }

      check()(null, configFromUrl(url, treeConfig[rootPath]));
    }
  }

  // Try to github mount submodules inside github mounted repos.  Otherwise
  // setup as normal cloned repo with remote.
  function configFromUrl(url, parent) {
    var match;
    if (parent && parent.githubName && url && (match = url.match(/github.com[:\/](.*?)(?:\.git)?$/))) {
      return { githubName: match[1] };
    }
    if (!url) return {};
    return {
      needsClone: true,
      url: url
    };
  }

  function singleCall(callback) {
    var done = false;
    return function () {
      if (done) return console.warn("Discarding extra callback");
      done = true;
      return callback.apply(this, arguments);
    };
  }


});


// /*global define*/
// define("js-git/mixins/path-to-entry", function () {
//   "use strict";

//   var modes = require('js-git/lib/modes');
//   var encoders = require('js-git/lib/encoders');

//   // Cache the tree entries by hash for faster path lookup.
//   var cache = {};

//   // Cached compiled directories that contain wildcards.
//   var dirs = {};

//   return function (repo) {
//     if (!repo.submodules) repo.submodules = {};
//     repo.pathToEntry = pathToEntry;
//     var loadAs = repo.loadAs;
//     if (loadAs) repo.loadAs = loadAsCached;
//     var saveAs = repo.saveAs;
//     if (saveAs) repo.saveAs = saveAsCached;
//     var createTree = repo.createTree;
//     if (createTree) repo.createTree = createTreeCached;

//     // Monkeypatch loadAs to cache non-blobs
//     function loadAsCached(type, hash, callback) {
//       if (!callback) return loadAsCached.bind(repo, type, hash);
//       if (hash in cache) {
//         // console.log("LOAD CACHED", hash);
//         return callback(null, encoders.normalizeAs(type, cache[hash]));
//       }
//       if (type === "blob") {
//         return loadAs.apply(repo, arguments);
//       }
//       loadAs.call(repo, type, hash, function (err, body, hash) {
//         if (body === undefined) return callback(err);
//         cache[hash] = body;
//         callback(null, body, hash);
//       });
//     }

//     // Monkeypatch saveAs to cache non-blobs
//     function saveAsCached(type, body, callback) {
//       if (!callback) {
//         return saveAsCached.bind(repo, type, body);
//       }
//       if (type === "blob") {
//         return saveAs.apply(repo, arguments);
//       }
//       saveAs.call(repo, type, body, function (err, hash, body) {
//         if (err) return callback(err);
//         cache[hash] = body;
//         callback(null, hash, body);
//       });
//     }

//     // Monkeypatch saveAs to cache non-blobs
//     function createTreeCached(entries, callback) {
//       if (!callback) {
//         return createTreeCached.bind(repo, entries);
//       }
//       createTree.call(repo, entries, function (err, hash, tree) {
//         if (err) return callback(err);
//         cache[hash] = tree;
//         callback(null, hash, tree);
//       });
//     }

//   };


//   function pathToEntry(root, path, callback) {
//     var repo = this;
//     if (!callback) return pathToEntry.bind(repo, root, path);

//     // Split path ignoring leading and trailing slashes.
//     var parts = path.split("/").filter(String);
//     var length = parts.length;
//     var index = 0;

//     // These contain the hash and mode of the path as we walk the segments.
//     var mode = modes.tree;
//     var hash = root;
//     return walk();

//     function patternCompile(source, target) {
//       // Escape characters that are dangerous in regular expressions first.
//       source = source.replace(/[\-\[\]\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
//       // Extract all the variables in the source and target and replace them.
//       source.match(/\{[a-z]+\}/g).forEach(function (match, i) {
//         source = source.replace(match, "(.*)");
//         target = target.replace(match, '$' + (i + 1));
//       });
//       var match = new RegExp("^" + source + "$");
//       match.target = target;
//       return match;
//     }

//     function compileDir(hash, tree, callback) {
//       var left = 1;
//       var done = false;
//       var wilds = Object.keys(tree).filter(function (key) {
//         return (modes.sym === tree[key].mode) && /\{[a-z]+\}/.test(key);
//       });
//       dirs[hash] = wilds;
//       wilds.forEach(function (key, i) {
//         if (done) return;
//         var hash = tree[key].hash;
//         var link = cache[hash];
//         if (link) {
//           wilds[i] = patternCompile(key, link);
//           return;
//         }
//         left++;
//         repo.loadAs("text", hash, function (err, link) {
//           if (done) return;
//           if (err) {
//             done = true;
//             return callback(err);
//           }
//           cache[hash] = link;
//           wilds[i] = patternCompile(key, link);
//           if (!--left) {
//             done = true;
//             callback();
//           }
//         });
//       });
//       if (!done && !--left) {
//         done = true;
//         callback();
//       }
//     }

//     function walk(err) {
//       if (err) return callback(err);
//       var cached;
//       outer:
//       while (index < length) {
//         // If the parent is a tree, look for our path segment
//         if (mode === modes.tree) {
//           cached = cache[hash];
//           // If it's not cached yet, abort and resume later.
//           if (!cached) return repo.loadAs("tree", hash, onValue);
//           var name = parts[index];
//           var entry = cached[name];
//           if (!entry) {
//             var dir = dirs[hash];
//             if (!dir) return compileDir(hash, cached, walk);
//             for (var i = 0, l = dir.length; i < l; i++) {
//               var wild = dir[i];
//               if (!wild.test(name)) continue;
//               mode = modes.sym;
//               hash = hash + "-" + name;
//               cache[hash] = name.replace(wild, wild.target);
//               break outer;
//             }
//             return callback();
//           }
//           index++;
//           hash = entry.hash;
//           mode = entry.mode;
//           continue;
//         }
//         // If the parent is a symlink, adjust the path in-place and start over.
//         if (mode === modes.sym) {
//           cached = cache[hash];
//           if (!cached) return repo.loadAs("text", hash, onValue);
//           // Remove the tail and remove the symlink segment from the head.
//           var tail = parts.slice(index);
//           parts.length = index - 1;
//           // Join the target resolving special "." and ".." segments.
//           cached.split("/").forEach(onPart);
//           // Add the tail back in.
//           parts.push.apply(parts, tail);
//           // Start over.  The already passed path will be cached and quite fast.
//           hash = root;
//           mode = modes.tree;
//           index = 0;
//           continue;
//         }
//         // If it's a submodule, jump over to that repo.
//         if (mode === modes.commit) {
//           var parentPath = parts.slice(0, index).join("/");
//           var submodule = repo.submodules[parentPath];
//           if (!submodule) {
//             return callback(new Error("Missing submodule for path: " + parentPath));
//           }
//           cached = cache[hash];
//           if (!cached) return submodule.loadAs("commit", hash, onValue);
//           var childPath = parts.slice(index).join("/");
//           return submodule.pathToEntry(cached.tree, childPath, callback);
//         }
//         return callback(new Error("Invalid path segment"));
//       }

//       // We've reached the final segment, let's preload symlinks and trees since
//       // we don't mind caching those.

//       var result;
//       if (mode === modes.tree) {
//         cached = cache[hash];
//         if (!cached) return repo.loadAs("tree", hash, onValue);
//         result = { tree: encoders.normalizeAs("tree", cached) };
//       }
//       else if (mode === modes.sym) {
//         cached = cache[hash];
//         if (!cached) return repo.loadAs("text", hash, onValue);
//         result = { link: cached };
//       }
//       else if (mode === modes.commit) {
//         cached = cache[hash];
//         if (!cached) return repo.loadAs("commit", hash, onValue);
//         result = { commit: encoders.normalizeAs("commit", cached) };
//       }
//       else {
//         result = {};
//       }
//       result.mode = mode;
//       result.hash = hash;

//       // In the case of submodule traversal, the caller's repo is different
//       return callback(null, result, repo);

//       // Used by the symlink code to resolve the target against the path.
//       function onPart(part) {
//         // Ignore leading and trailing slashes as well as "." segments.
//         if (!part || part === ".") return;
//         // ".." pops a path segment from the stack
//         if (part === "..") parts.pop();
//         // New paths segments get pushed on top.
//         else parts.push(part);
//       }

//     }

//     function onValue(err, value) {
//       if (value === undefined) return callback(err);
//       // Don't let anyone change this value.
//       if (typeof value === "object") Object.freeze(value);
//       cache[hash] = value;
//       return walk();
//     }

//   }

// });