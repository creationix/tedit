/*global define*/
define("tree2", function () {

  var $ = require('elements');
  var dialog = require('dialog');
  var modes = require('modes');
  var domBuilder = require('dombuilder');
  var parseConfig = require('parseconfig');
  var prefs = require('prefs');
  var pathCmp = require('encoders').pathCmp;
  var newDoc = require('document');

  // Memory for opened trees.  Accessed by path
  var openPaths = prefs.get("openPaths", {});
  // Paths to the currently selected or active tree
  var selectedPath, activePath;

  // State for repos in tree.
  var treeConfig = prefs.get("treeConfig", {});

  // Put in some sample data if the editor is empty
  if (!Object.keys(treeConfig).length) {
    treeConfig.conquest = {
      current: "703bfa9bfee7032a71f7ecf5c979d05475760abd",
      head: "703bfa9bfee7032a71f7ecf5c979d05475760abd",
      githubName: "creationix/conquest"
    };
    treeConfig.blog = {
      current: "84668ad9cfbd02b2ccf68fa3ab913cecce931f6d",
      head: "84668ad9cfbd02b2ccf68fa3ab913cecce931f6d",
      githubName: "creationix/blog"
    };
    prefs.set("treeConfig", treeConfig);
  }

  // Live repos accessed by path
  var repos = {};

  // docs by path
  var docPaths = {};

  // Oauth token for github API calls
  var githubToken = prefs.get("githubToken");
  if (githubToken) return render();
  dialog.prompt("Enter github Auth Token", "", function (token) {
    if (!token) return;
    prefs.set("githubToken", githubToken = token);
    render();
  });

  function loadSubmoduleConfig(path, callback) {
    // Find the longest
    var parentPath = "";
    Object.keys(treeConfig).forEach(function (name) {
      if (name.length > path.length) return;
      if (name !== path.substr(0, name.length)) return;
      if (name.length > parentPath.length) parentPath = name;
    });
    if (!parentPath) {
      return callback(new Error("Can't find parent repo for " + path));
    }
    var parent = treeConfig[parentPath];
    var parentRepo = repos[parentPath];

    parentRepo.loadAs("tree", parent.root, function (err, tree) {
      if (!tree) {
        return callback(err || new Error("Missing tree " + parent.root));
      }
      var entry = tree[".gitmodules"];
      if (!entry || !modes.isFile(entry.mode)) {
        return callback(new Error("Missing or invalid " + parentPath + "/.gitmodules"));
      }
      parentRepo.loadAs("text", entry.hash, function (err, text) {
        if (err) return callback(err);
        var meta;
        try { meta = parseConfig(text); }
        catch (err) { return callback(err); }

        var url;
        var subPath = path.substr(parentPath.length + 1);
        for (var key in meta.submodule) {
          var item = meta.submodule[key];
          if (item.path !== subPath) continue;
          url = item.url;
          break;
        }
        if (!url) {
          return callback(new Error("Missing submodule " + subPath + " in .gitmodules"));
        }
        onUrl(url);
      });
    });

    function onUrl(url) {
      if (!parent.githubName) {
        return callback(new Error("TODO: clone submodule"));
      }
      var match = url.match(/github.com[:\/](.*?)(?:\.git)?$/);
      if (!match) {
        return callback(new Error(url + " is not a github repo"));
      }
      var config = {
        githubName: match[1]
      };
      var repo = repos[path] = createRepo(config);
      repo.readRef("refs/heads/master", function (err, hash) {
        if (err) return callback(err);
        config.head = config.current = hash;
        callback(null, config);
      });
    }
  }

  function createRepo(config) {
    var repo = {};
    if (config.githubName) {
      require('js-github')(repo, config.githubName, githubToken);
      // Cache github objects locally in indexeddb
      require('addcache')(repo, require('indexeddb'));
    }
    else {
      require('indexeddb')(repo, config.idbName);
    }
    // Add pathToEntry API and cache non-blob types in ram
    require('pathtoentry')(repo);
    // Combine concurrent read requests for the same hash
    require('read-combiner')(repo);

    // Add 500ms delay to all I/O operations for debugging
    require('delay')(repo, 200);
    return repo;
  }

  function render() {
    var names = Object.keys(treeConfig).filter(function (path) {
      return path.indexOf("/") < 0;
    });
    var left = names.length;
    var roots = new Array(left);
    names.forEach(function (name, i) {
      renderRepo(name, function (err, root) {
        if (err) throw err;
        roots[i] = root;
        if (--left) return;
        swap();
      });
    });

    function swap() {
      $.tree.textContent = "";
      $.tree.appendChild(domBuilder(roots));
    }
  }

  function renderRepo(path, callback) {
    var config, repo;
    if (treeConfig[path]) onConfig(null, treeConfig[path]);
    else loadSubmoduleConfig(path, onConfig);

    function onConfig(err, result) {
      if (err) return callback(err);
      config = result;
      repo = repos[path] || (repos[path] = createRepo(config));
      treeConfig[path] = config;
      prefs.set("treeConfig", treeConfig);
      repo.loadAs("commit", config.current, onCommit);
    }

    function onCommit(err, commit) {
      if (!commit) return callback(err || new Error("Missing commit " + config.current));
      config.root = commit.tree;
      renderTree(commit.tree, path, onUi);
    }

    function onUi(err, ui) {
      if (err) return callback(err);
      if (config.current !== config.head) ui[1][1]["class"] += " staged";
      ui[1].splice(3, 0, ["i.icon-fork.tight"]);
      callback(null, ui);
    }

    function renderNode(mode, path) {
      var name = path.substr(path.lastIndexOf("/") + 1);
      var icon = modes.isFile(mode) ? "doc" :
        mode === modes.sym ? "link" :
        openPaths[path] ? "folder-open" : "folder";
      var classes = ["row"];
      if (selectedPath === path) classes.push("selected");
      if (activePath === path) classes.push("activated");

      var rowProps = {
        "class": classes.join(" ")
      };
      var spanProps = {};
      if (mode === modes.exec) spanProps["class"] = "executable";
      return ["li",
        ["div", rowProps,
          ["i.icon-" + icon],
          ["span", spanProps, name]
        ]
      ];
    }

    function renderTree(hash, path, callback) {
      var ui = renderNode(modes.tree, path);
      ui[1][1].onclick = function (evt) {
        evt.stopPropagation();
        evt.preventDefault();
        if (openPaths[path]) delete openPaths[path];
        else openPaths[path] = true;
        prefs.set("openPaths", openPaths);
        render();
      };
      var open = openPaths[path];
      if (!open) return callback(null, ui);
      repo.loadAs("tree", hash, function (err, tree) {
        if (!tree) return callback(err || new Error("Missing tree " + hash));
        var names = Object.keys(tree);
        if (!names.length) return callback(null, ui);
        var left = names.length;
        var children = new Array(left);
        Object.keys(tree).sort(pathCmp).forEach(function (name, i) {
          var childPath = path ? path + "/" + name : name;
          var entry = tree[name];
          if (modes.isBlob(entry.mode)) {
            var childUi = renderNode(entry.mode, childPath);
            childUi[1][1]["data-hash"] = entry.hash;
            childUi[1][1].onclick = function (evt) {
              evt.stopPropagation();
              evt.preventDefault();
              activate(childPath, entry, repo);
            };
            return onChild(null, childUi);
          }
          if (entry.mode === modes.tree) {
            return renderTree(entry.hash, childPath, onChild);
          }
          if (entry.mode === modes.commit) {
            return renderRepo(childPath, onChild);
          }
          function onChild(err, childUi) {
            if (err) throw err;
            children[i] = childUi;
            if (--left) return;
            ui.push(["ul", children]);
            callback(null, ui);
          }
        });
      });
    }
  }

  function activate(path, entry, repo) {
    if (activePath === path) {
      activePath = null;
      return render();
    }
    activePath = path;
    render();
    var doc = docPaths[path];
    if (doc) {
      if (doc.path !== path) doc.setPath(path);
      if (doc.mode !== entry.mode) doc.setMode(entry.mode);
      if (doc.hash !== entry.hash) {
        repo.loadAs("blob", entry.hash, function (err, body) {
          if (err) throw err;
          doc.hash = entry.hash;
          doc.setBody(body);
          doc.activate();
        });
      }
      else doc.activate();
    }
    else {
      repo.loadAs("blob", entry.hash, function (err, body) {
        if (err) throw err;
        doc = docPaths[path] = newDoc(path, entry.mode, body);
        doc.hash = entry.hash;
        doc.activate();
      });
    }
  }

});