/*global define, chrome*/
define("repos", function () {

  var prefs = require('prefs');
  var treeConfig = prefs.get("treeConfig", {});
  var parseConfig = require('parseconfig');
  var encodeConfig = require('encodeconfig');
  var importEntry = require('importfs');
  var clone = require('clone');
  var modes = require('modes');
  var repos = {};

  return {
    mapRootNames: mapRootNames,
    loadConfig: loadConfig,
    createEmpty: createEmpty,
    createFromFolder: createFromFolder,
    createClone: createClone,
    createGithubMount: createGithubMount,
    splitPath: splitPath,
  };

  // Map the names ot the root repos (useful for rendering a tree)
  function mapRootNames(callback) {
    return Object.keys(treeConfig).filter(function (path) {
      return path.indexOf("/") < 0;
    }).map(function (name) {
      return callback(name);
    });
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
      require('js-github')(repo, config.githubName, githubToken);
      // Github has this built-in, but it's currently very buggy
      require('createtree')(repo);
      // Cache github objects locally in indexeddb
      require('addcache')(repo, require('indexeddb'));
    }
    else {
      if (!config.prefix) {
        config.prefix = Date.now().toString(36) + "-" + (Math.random() * 0x100000000).toString(36);
      }
      require('indexeddb')(repo, config.prefix);
      require('createtree')(repo);
    }
    // Add pathToEntry API and cache non-blob types in ram
    require('pathtoentry')(repo);
    // Combine concurrent read requests for the same hash
    require('read-combiner')(repo);

    // Add delay to all I/O operations for debugging
    // require('delay')(repo, 300);
    return repo;
  }

  // global-path based pathToEntry
  function pathToEntry(path, callback) {
    var rootPath, localPath, config, repo;
    try {
      rootPath = findRoot(path);
      localPath = path.substring(rootPath.length + 1);
      config = treeConfig[rootPath];
      if (!config.current) throw new Error("missing commit");
      repo = createRepo(config);
    }
    catch (err) { return callback(err); }
    return repo.loadAs("commit", config.current, onCommit);

    function onCommit(err, commit) {
      if (err) return callback(err);
      return repo.pathToEntry(commit.tree, localPath, callback);
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
    var base = string.substring(string.lastIndexOf("/") + 1).replace(/\.git$/, "").replace(/[!@#%\^&*()\\|+={}\[\]~`,<>?:;"']+/gi, " ").trim() || "unnamed";
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

});