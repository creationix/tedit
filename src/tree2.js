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

  $.tree.addEventListener("contextmenu", onGlobalContext, false);

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

  function renderRepo(repoPath, repoHash, onChange) {
    var config, repo;
    var commitNode = renderCommit(repoPath, repoHash);
    return commitNode.el;

    // Render the UI for repo and submodule roots
    function renderCommit(path, hash) {
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
        if (hash && config.current !== hash) {
          config.current = hash;
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
        if (dirtyConfig) prefs.set("treeConfig", treeConfig);
        $.icon.setAttribute("title", "tree " + commit.tree);
        $.row.addEventListener("click", onTreeClicker(path, commit.tree, $), false);
        $.row.addEventListener("contextmenu", makeMenu({
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
      return domBuilder(Object.keys(tree).sort(pathCmp).map(function (name) {
        var entry = tree[name];
        var path = parentPath + "/" + name;
        if (entry.mode === modes.commit) return renderRepo(path, entry.hash, onChanger(path));
        if (entry.mode === modes.tree) return renderTree(path, entry);
        if (modes.isBlob(entry.mode)) return renderBlob(path, entry);
        fail($, new Error("Invalid mode " + entry.mode));
      }));
    }

    function onChanger(path) {
      var localPath = path.substr(repoPath.length + 1);
      return function (hash) {
        updateTree(commitNode, [{
          path: localPath,
          mode: modes.commit,
          hash: hash
        }]);
      };
    }

    function renderBlob(path, entry) {
      var $ = genUi(path, entry.mode, {});
      $.icon.setAttribute("title", "blob " + entry.hash);
      $.row.addEventListener("contextmenu", makeMenu({
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
      $.row.addEventListener("contextmenu", makeMenu({
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

    function commitChanges(node) {
      var $ = node.$, current;
      var userEmail, userName;
      repo.loadAs("commit", config.current, onCurrent);

      function onCurrent(err, result) {
        if (!result) fail($, err || new Error("Missing commit " + config.current));
        current = result;
        userName = prefs.get("userName", "");
        userEmail = prefs.get("userEmail", "");
        dialog.multiEntry("Enter Commit Message", [
          {name: "message", placeholder: "Details about commit.", required:true},
          {name: "name", placeholder: "Full Name", required:true, value:userName},
          {name: "email", placeholder: "email@provider.com", required:true, value:userEmail},
        ], onResult);
      }
      function onResult(result) {
        if (!result) return;
        if (result.name !== userName) prefs.set("userName", result.name);
        if (result.email !== userEmail) prefs.set("userEmail", result.email);
        repo.saveAs("commit", {
          tree: current.tree,
          author: {
            name: result.name,
            email: result.email
          },
          parent: config.head,
          message: result.message
        }, onSave);
      }

      function onSave(err, hash) {
        if (err) fail($, err);
        setCurrent(hash, true);
      }
    }

    function revertChanges() {
      dialog.confirm("Are you sure you want to loose all uncommitted changes?", function (confirm) {
        if (!confirm) return;
        setCurrent(config.head);
      });
    }

    function checkHead(node) {
      repo.readRef("refs/heads/master", function (err, hash) {
        if (!hash) fail(node.$, err || new Error("Missing master branch"));
        if (config.head !== hash) {
          config.head = hash;
          prefs.set("treeConfig", treeConfig);
          render();
        }
      });
    }

    function createFile(node) {
      dialog.prompt("Enter name for new file", "", function (name) {
        if (!name) return;
        updateTree(node.$, [{
          path: node.localPath ? node.localPath + "/" + name : name,
          mode: modes.file,
          content: ""
        }]);
      });
    }

    function createFolder(node) {
      dialog.prompt("Enter name for new folder", "", function (name) {
        if (!name) return;
        repo.saveAs("tree", [], function (err, hash) {
          if (err) fail(node.$, err);
          openPaths[node.path + "/" + name] = true;
          prefs.set("openPaths", openPaths);
          updateTree(node.$, [{
            path: node.localPath ? node.localPath + "/" + name : name,
            mode: modes.tree,
            hash: hash
          }]);
        });
      });
    }

    function createSymLink(node) {
      dialog.prompt("Enter name for new symlink", "", function (name) {
        if (!name) return;
        updateTree(node.$, [{
          path: node.localPath ? node.localPath + "/" + name : name,
          mode: modes.sym,
          content: ""
        }]);
      });
    }


    function toggleExec(node) {
      updateTree(node.$, [{
        path: node.localPath,
        mode: node.mode === modes.exec ? modes.file : modes.exec,
        hash: node.hash
      }]);
    }

    function renameEntry(node) {
      dialog.prompt("Enter new name", node.localPath, function (newPath) {
        if (!newPath || newPath === node.localPath) return;
        updateTree(node.$, [
          {path: node.localPath},
          {path: newPath, mode: node.mode, hash: node.hash}
        ]);
      });
    }

    function removeEntry(node) {
      dialog.confirm("Are you sure you want to remove " + node.path + "?", function (confirm) {
        if (!confirm) return;
        updateTree(node.$, [{
          path: node.localPath
        }]);
      });
    }

    function updateTree($, entries) {
      // The current and head commits
      var current, head;
      $.icon.setAttribute("class", "icon-spin1 animate-spin");

      repo.loadAs("commit", config.current, onCurrent);

      function onCurrent(err, commit) {
        if (!commit) fail($, err || new Error("Missing commit " + config.current));
        current = commit;
        // Base the tree update on the currently saved state.
        entries.base = commit.tree;
        if (config.head === config.current) {
          head = current;
          repo.createTree(entries, onTree);
        }
        else {
          repo.loadAs("commit", config.head, onHead);
        }
      }

      function onHead(err, commit) {
        if (!commit) fail($, err || new Error("Missing commit " + config.current));
        head = commit;
        repo.createTree(entries, onTree);
      }

      function onTree(err, root) {
        if (err) fail($, err);
        if (root === head.tree) setCurrent(config.head);
        else setTree(root);
      }
    }

    function setTree(root) {
      var $ = commitNode;
      $.icon.setAttribute("class", "icon-spin1 animate-spin");
      repo.saveAs("commit", {
        tree: root,
        author: {name:"Tedit AutoCommit",email:"tedit@creationix.com"},
        parent: config.head,
        message: "Uncommitted changes in tedit"
      }, onCommit);

      function onCommit(err, result) {
        if (err) fail($, err);
        setCurrent(result);
      }
    }

    function setCurrent(hash, isHead) {
      var $ = commitNode;
      $.icon.setAttribute("class", "icon-spin1 animate-spin");
      if (onChange) return onChange(hash);

      var ref = isHead ? "refs/heads/master" : "refs/tags/current";

      return repo.updateRef(ref, hash, function (err) {
        if (err) fail($, err);
        config.current = hash;
        if (isHead) config.head = hash;
        render();
      });
    }

    function makeMenu(node) {
      node.localPath = node.path.substr(repoPath.length + 1);
      return function (evt) {
        nullify(evt);
        var actions = [];
        var type;
        actions.push({icon:"globe", label:"Serve Over HTTP"});
        actions.push({icon:"hdd", label:"Live Export to Disk"});
        if (node.mode === modes.commit) {
          if (config.head !== config.current) {
            actions.push({sep:true});
            actions.push({icon:"floppy", label:"Commit Changes", action: commitChanges});
            actions.push({icon:"ccw", label:"Revert all Changes", action: revertChanges});
          }
          actions.push({sep:true});
          if (config.githubName) {
            actions.push({icon:"github", label:"Check for Updates", action: checkHead});
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
            actions.push({icon:"doc", label:"Create File", action: createFile});
            actions.push({icon:"folder", label:"Create Folder", action: createFolder});
            actions.push({icon:"link", label:"Create SymLink", action: createSymLink});
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
          actions.push({icon:"asterisk", label: label, action: toggleExec});
        }
        else if (node.mode === modes.sym) {
          type = "SymLink";
        }
        actions.push({sep:true});
        if (node.path.indexOf("/") >= 0) {
          actions.push({icon:"pencil", label:"Rename " + type, action: renameEntry});
          actions.push({icon:"trash", label:"Delete " + type, action: removeEntry});
        }
        else {
          actions.push({icon:"pencil", label:"Rename Repo"});
          actions.push({icon:"trash", label:"Remove Repo"});
        }
        contextMenu(evt, node, actions);
      };
    }
  }

  function onGlobalContext(evt) {
    nullify(evt);
    contextMenu(evt, null, [
      {icon:"git", label: "Create Empty Git Repo"},
      {icon:"hdd", label:"Create Repo From Folder"},
      {icon:"fork", label: "Clone Remote Repo"},
      {icon:"github", label: "Live Mount Github Repo"}
    ]);
  }

  // A more user friendly throw that shows the source of the error visually
  // to the user with a short message.
  function fail($, err) {
    $.icon.setAttribute("class", "icon-attention");
    $.icon.setAttribute("title", $.icon.getAttribute("title") + "\n" + err.toString());
    throw err;
  }

  function dirname(path) {
    return path.substr(0, path.lastIndexOf("/"));
  }
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