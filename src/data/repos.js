/*global define*/
define("data/repos", function () {

  var prefs = require('ui/prefs');
  var treeConfig = prefs.get("treeConfig", {});
  var parseConfig = require('js-git/lib/config-codec').parse;
  var encodeConfig = require('js-git/lib/config-codec').encode;
  var importEntry = require('data/importfs');
  var clone = require('data/clone');
  var modes = require('js-git/lib/modes');
  var pathJoin = require('lib/pathjoin');
  var rescape = require('lib/rescape');
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

  function addSubModule(path, localPath, name, url, callback) {
    callback = singleCall(callback);
    var childConfig, childRepo, childHead;
    var repo = repos[path];
    var config = treeConfig[path];
    var meta;
    pathToEntry(path + "/.gitmodules", onMetaEntry);
    pathToEntry(path + "/" + localPath, onTreeEntry);

    function onMetaEntry(err, entry, result) {
      if (err) return callback(err);
      if (!entry) {
        meta = {};
        return join();
      }
      if (result !== repo) return callback(new Error("repo mismatch"));
      return repo.loadAs("text", entry.hash, onText);
    }

    function onText(err, text) {
      if (err) return callback(err);
      try { meta = parseConfig(text); }
      catch (err) { return callback(err); }
      join();
    }

    function onTreeEntry(err, entry, result) {
      if (!entry) return callback(err || new Error("Missing parent tree " + localPath));
      if (result !== repo) return callback(new Error("repo mismatch"));
      name = genName(name || url, entry.tree);
      localPath = localPath ? localPath + "/" + name : name;
      var childPath = path + "/" + localPath;
      childConfig = treeConfig[childPath] = configFromUrl(url, config);
      childRepo = repos[childPath] = createRepo(childConfig);
      loadConfig(childPath, null, onConfig);
    }

    function onConfig(err) {
      if (err) return callback(err);
      childHead = childConfig.head || childConfig.current;
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

    function onCurrent(err, hash) {
      if (!hash) return callback(err || new Error("Invalid current hash"));
      config.current = hash;
      onHead();
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

    // Cache everything except blobs over 100 bytes in memory.
    require('js-git/mixins/mem-cache')(repo);

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
    // console.log("pathToEntry", path);
    var mode, hash, repo, rootPath, parts;

    // strip extra leading and trailing slashes
    path = path.split("/").filter(Boolean).join("/");

    start();

    function start() {
      try {
        // Find the nearest known repo root
        rootPath = findRoot(path);
        parts = path.substring(rootPath.length + 1).split("/").filter(Boolean);
        path = rootPath;
        var config = treeConfig[rootPath];
        repo = repos[rootPath] || (repos[rootPath] = createRepo(config));
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
      if (!entry) {
        var match = findMatch(tree, name);
        if (match) {
          entry = tree[match.key];
          return repo.loadAs("text", entry.hash, function (err, link) {
            if (err) return callback(err);
            mode = modes.sym;
            hash = entry.hash + "-" + match.value;
            return onSym(null, link.replace(match.variable, match.value));
          });
        }
        return callback();
      }
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
        path += "/" + name;
        return loadConfig(path, entry.hash, function (err, pair) {
          if (err) return callback(err);
          // Start over with this repo as the new root.
          rootPath = path;
          repo = pair.repo;
          var config = pair.config;
          return repo.loadAs("commit", config.current, onCommit);
        });
      }
      return done({});
    }

    function onSym(err, link) {
      if (link === undefined) return callback(err || new Error("Missing symlink " + hash));
      if (!parts.length && link.indexOf("|") >= 0) {
        return done({etag:hash, link:link});
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

  function findMatch(tree, name) {
    for (var key in tree) {
      if (tree[key].mode !== modes.sym) continue;
      var match = key.match("^(.*)({[a-z]+})(.*)$");
      if (!match) continue;
      var variable = match[2];
      var pattern = new RegExp("^" + rescape(match[1]) + "(.+)" + rescape(match[3]) + "$");
      match = name.match(pattern);
      if (!match) continue;
      return {
        pattern: pattern,
        key: key,
        variable: variable,
        value: match[1]
      };
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
