/*global define*/
define("tree2", function () {

  var $ = require('elements');
  var defer = require('defer');
  var dialog = require('dialog');
  var modes = require('modes');
  var domBuilder = require('dombuilder');
  var parseConfig = require('parseconfig');
  var prefs = require('prefs');
  var pathCmp = require('encoders').pathCmp;
  var newDoc = require('document');
  var contextMenu = require('context-menu');

  // Memory for opened trees.  Accessed by path
  var openPaths = prefs.get("openPaths", {});
  // Paths to the currently selected or active tree
  var selectedPath, activePath;

  // State for repos in tree.
  var treeConfig = prefs.get("treeConfig", {});

  // Put in some sample data if the editor is empty
  // treeConfig = {};
  if (!Object.keys(treeConfig).length) {
    treeConfig.conquest = { githubName: "creationix/conquest" };
    treeConfig.blog = { githubName: "creationix/blog" };
    treeConfig.tedit = { githubName: "creationix/tedit" };
    treeConfig["tedit-app"] = { githubName: "creationix/tedit-app" };
    treeConfig.luvit = { githubName: "luvit/luvit" };
    prefs.set("treeConfig", treeConfig);
  }

  // Live repos accessed by path
  var repos = {};

  // docs by path
  var docPaths = {};

  $.tree.addEventListener("contextmenu", onContexter(), false);

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
      callback(null, config);
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

    // Add delay to all I/O operations for debugging
    // require('delay')(repo, 300);
    return repo;
  }

  function render() {
    var roots = Object.keys(treeConfig).filter(function (path) {
      return path.indexOf("/") < 0;
    }).map(function (name) {
      return renderRepo(name);
    });
    // Replace the tree with the new roots
    while ($.tree.firstChild) $.tree.removeChild($.tree.firstChild);
    $.tree.appendChild(domBuilder(roots));
  }

  function genUi(path, mode) {
    var $ = {};
    var name = path.substr(path.lastIndexOf("/") + 1);
    var icon = modes.isFile(mode) ? "doc" :
      mode === modes.sym ? "link" : "folder";
    var spanProps = {title:path};
    if (mode === modes.exec) spanProps["class"] = "executable";
    var ui = ["li$el",
      [".row$row",
        ["i$icon.icon-" + icon],
        ["span$span", spanProps, name]
      ]
    ];
    if (mode === modes.commit) {
      ui[1].splice(2, 0, ["i$fork.icon-fork.tight"]);
    }
    if (mode === modes.commit || mode === modes.tree) {
      ui.push(["ul$ul"]);
    }
    domBuilder(ui, $);
    return $;
  }

  function nullify(evt) {
    evt.preventDefault();
    evt.stopPropagation();
  }

  function renderRepo(path) {
    var config, repo;
    return renderCommit(path).el;

    // Render the UI for repo and submodule roots
    function renderCommit(path) {
      var $ = genUi(path, modes.commit);
      var dirtyConfig = false;
      $.icon.setAttribute("class", "icon-spin1 animate-spin");
      if (treeConfig[path]) defer(function () {
        onConfig(null, treeConfig[path]);
      });
      else loadSubmoduleConfig(path, onConfig);

      return $;

      function onConfig(err, result) {
        if (err) fail($, err);
        config = result;
        if (config !== treeConfig[path]) {
          treeConfig[path] = config;
          dirtyConfig = true;
        }
        repo = repos[path] || (repos[path] = createRepo(config));
        if (config.head) return onHead(null, config.head);
        repo.readRef("refs/heads/master", onHead);
      }

      function onHead(err, hash) {
        if (!hash) fail($, err || new Error("Missing master ref"));
        if (config.head !== hash) {
          config.head = config.current = hash;
          dirtyConfig = true;
        }
        else if (!config.current) {
          config.current = config.head;
          dirtyConfig = true;
        }
        $.fork.setAttribute("title", "commit " + config.current);
        if (config.current !== config.head) {
          $.row.classList.add("staged");
        }

        repo.loadAs("commit", config.current, onCommit);
      }

      function onCommit(err, commit) {
        if (!commit) fail($, err || new Error("Missing commit " + config.current));
        if (config.root !== commit.tree) {
          config.root = commit.tree;
          dirtyConfig = true;
        }
        if (dirtyConfig) prefs.set("treeConfig", treeConfig);
        $.icon.setAttribute("title", "tree " + config.root);
        $.row.addEventListener("click", onTreeClicker(path, commit.tree, $), false);
        $.row.addEventListener("contextmenu", onContexter({
          $: $,
          path: path,
          mode: modes.commit,
          hash: commit.current
        }), false);
        if (openPaths[path]) openTree(path, commit.tree, $);
        else $.icon.setAttribute("class", "icon-folder");
      }

    }

    function renderChildren(parentPath, tree) {
      return domBuilder(Object.keys(tree).map(function (name) {
        var entry = tree[name];
        var path = parentPath + "/" + name;
        if (entry.mode === modes.commit) return renderRepo(path, entry);
        if (entry.mode === modes.tree) return renderTree(path, entry);
        if (modes.isBlob(entry.mode)) return renderBlob(path, entry);
        fail($, new Error("Invalid mode " + entry.mode));
      }));
    }

    function renderBlob(path, entry) {
      var $ = genUi(path, entry.mode, {});
      $.icon.setAttribute("title", "blob " + entry.hash);
      $.row.addEventListener("contextmenu", onContexter({
        $: $,
        path: path,
        mode: entry.mode,
        hash: entry.hash
      }), false);
      return $.el;
    }

    function renderTree(path, entry) {
      var $ = genUi(path, entry.mode);
      $.icon.setAttribute("title", "tree " + entry.hash);
      $.row.addEventListener("click", onTreeClicker(path, entry.hash, $), false);
      $.row.addEventListener("contextmenu", onContexter({
        $: $,
        path: path,
        mode: entry.mode,
        hash: entry.hash
      }), false);
      if (openPaths[path]) openTree(path, entry.hash, $);
      return $.el;
    }

    function onTreeClicker(path, hash, $) {
      return function (evt) {
        nullify(evt);
        if (openPaths[path]) closeTree(path, hash, $);
        else openTree(path, hash, $);
      };
    }


    function openTree(path, hash, $) {
      $.icon.setAttribute("class", "icon-spin1 animate-spin");
      openPaths[path] = true;
      prefs.set("openPaths", openPaths);
      repo.loadAs("tree", hash, function (err, tree) {
        if (!tree) fail($, err || new Error("Missing tree " + hash));
        $.icon.setAttribute("class", "icon-folder-open");
        $.ul.appendChild(renderChildren(path, tree));
      });
    }

    function closeTree(path, hash, $) {
      $.icon.setAttribute("class", "icon-folder");
      while ($.ul.firstChild) $.ul.removeChild($.ul.firstChild);
      delete openPaths[path];
      prefs.set("openPaths", openPaths);
    }
  }

  function onContexter(node) {
    return function (evt) {
      nullify(evt);
      var actions = [];
      if (node) {
        var type;
        actions.push({icon:"globe", label:"Serve Over HTTP"});
        actions.push({icon:"hdd", label:"Live Export to Disk"});
        if (node.mode === modes.commit) {
          var config = treeConfig[node.path];
          if (config.head !== config.current) {
            actions.push({sep:true});
            actions.push({icon:"floppy", label:"Commit Changes"});
            actions.push({icon:"ccw", label:"Revert all Changes"});
          }
          actions.push({sep:true});
          if (config.githubName) {
            actions.push({icon:"github", label:"Check for Updates"});
          }
          else {
            actions.push({icon:"download-cloud", label:"Pull from Remote"});
            actions.push({icon:"upload-cloud", label:"Push to Remote"});
          }
        }
        if (node.mode === modes.tree || node.mode === modes.commit) {
          type = node.mode === modes.commit ? "Submodule" : "Folder";
          if (openPaths[node.path]) {
            actions.push({sep:true});
            actions.push({icon:"doc", label:"Create File"});
            actions.push({icon:"folder", label:"Create Folder"});
            actions.push({icon:"link", label:"Create SymLink"});
            actions.push({sep:true});
            actions.push({icon:"fork", label: "Add Submodule"});
            actions.push({icon:"folder", label:"Import Folder"});
            actions.push({icon:"docs", label:"Import File(s)"});
          }
        }
        else if (modes.isFile(node.mode)) {
          type = "File";
          actions.push({sep:true});
          var label = (node.mode === modes.exec) ?
            "Make not Executable" :
            "Make Executable";
          actions.push({icon:"asterisk", label: label});
        }
        else if (node.mode === modes.sym) {
          type = "SymLink";
        }
        actions.push({sep:true});
        if (node.path.indexOf("/") >= 0) {
          actions.push({icon:"pencil", label:"Rename " + type});
          actions.push({icon:"trash", label:"Delete " + type});
        }
        else {
          actions.push({icon:"pencil", label:"Rename Repo"});
          actions.push({icon:"trash", label:"Remove Repo"});
        }
      }
      else {
        actions.push({icon:"git", label: "Create Empty Git Repo"});
        actions.push({icon:"hdd", label:"Create Repo From Folder"});
        actions.push({icon:"fork", label: "Clone Remote Repo"});
        actions.push({icon:"github", label: "Live Mount Github Repo"});
      }

      contextMenu(evt, node, actions);
    };
  }

  // A more user friendly throw that shows the source of the error visually
  // to the user with a short message.
  function fail($, err) {
    $.icon.setAttribute("class", "icon-attention");
    $.icon.setAttribute("title", $.icon.getAttribute("title") + "\n" + err.toString());
    throw err;
  }



  //   function renderTree(hash, path, callback) {
  //     var ui = renderNode(modes.tree, path);
  //     ui[1][1].onclick = function (evt) {
  //       evt.stopPropagation();
  //       evt.preventDefault();
  //       else openPaths[path] = true;
  //       prefs.set("openPaths", openPaths);
  //       render();
  //     };
  //     var open = openPaths[path];
  //     if (!open) return callback(null, ui);
  //     repo.loadAs("tree", hash, function (err, tree) {
  //       if (!tree) return callback(err || new Error("Missing tree " + hash));
  //       var names = Object.keys(tree);
  //       if (!names.length) return callback(null, ui);
  //       var left = names.length;
  //       var children = new Array(left);
  //       Object.keys(tree).sort(pathCmp).forEach(function (name, i) {
  //         var childPath = path ? path + "/" + name : name;
  //         var entry = tree[name];
  //         if (modes.isBlob(entry.mode)) {
  //           var childUi = renderNode(entry.mode, childPath);
  //           childUi[1][1]["data-hash"] = entry.hash;
  //           childUi[1][1].onclick = function (evt) {
  //             evt.stopPropagation();
  //             evt.preventDefault();
  //             activate(childPath, entry, repo);
  //           };
  //           return onChild(null, childUi);
  //         }
  //         if (entry.mode === modes.tree) {
  //           return renderTree(entry.hash, childPath, onChild);
  //         }
  //         if (entry.mode === modes.commit) {
  //           return renderRepo(childPath, onChild);
  //         }
  //         function onChild(err, childUi) {
  //           if (err) throw err;
  //           children[i] = childUi;
  //           if (--left) return;
  //           ui.push(["ul", children]);
  //           callback(null, ui);
  //         }
  //       });
  //     });
  //   }


  // function activate(path, entry, repo) {
  //   if (activePath === path) {
  //     activePath = null;
  //     return render();
  //   }
  //   activePath = path;
  //   render();
  //   var doc = docPaths[path];
  //   if (doc) {
  //     if (doc.path !== path) doc.setPath(path);
  //     if (doc.mode !== entry.mode) doc.setMode(entry.mode);
  //     if (doc.hash !== entry.hash) {
  //       repo.loadAs("blob", entry.hash, function (err, body) {
  //         if (err) throw err;
  //         doc.hash = entry.hash;
  //         doc.setBody(body);
  //         doc.activate();
  //       });
  //     }
  //     else doc.activate();
  //   }
  //   else {
  //     repo.loadAs("blob", entry.hash, function (err, body) {
  //       if (err) throw err;
  //       doc = docPaths[path] = newDoc(path, entry.mode, body);
  //       doc.hash = entry.hash;
  //       doc.activate();
  //     });
  //   }
  // }

});