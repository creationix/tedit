/*global define, chrome*/
define("tree2", function () {

  var $ = require('elements');
  var modes = require('modes');
  var domBuilder = require('dombuilder');
  var makeRow = require('row');
  var dialog = require('dialog');
  var prefs = require('prefs');
  var newDoc = require('document');
  var startServer = require('startserver');
  var contextMenu = require('context-menu');
  var fail = require('fail');
  var editor = require('editor');
  var repos = require('repos');

  // Memory for opened trees.  Accessed by path
  var openPaths = prefs.get("openPaths", {});
  // Paths to the currently selected or active tree
  var selected, active, activePath;

  // docs by path
  var docPaths = {};

  $.tree.addEventListener("contextmenu", onGlobalContext, false);
  $.tree.addEventListener("click", onGlobalClick, false);

  render();

  function findNode(element) {
    while (element !== $.tree) {
      if (element.js) return element.js;
      element = element.parentNode;
    }
  }

  function onGlobalClick(evt) {
    var node = findNode(evt.target);
    if (!node) return;
    nullify(evt);
    node.onClick();
  }

  function render() {
    var roots = repos.mapRootNames(function (name) {
      var node = renderRepo(name);
      return node.el;
    });
    // Replace the tree with the new roots
    while ($.tree.firstChild) $.tree.removeChild($.tree.firstChild);
    $.tree.appendChild(domBuilder(roots));
  }

  function renderRepo(repoPath, repoHash) {
    var config, repo;
    var root = renderCommit(repoPath, repoHash);
    return root;

    // Render the UI for repo and submodule roots
    function renderCommit(path, hash) {
      var node = makeRow(path, modes.commit, hash);
      node.onClick = onClick.bind(null, node);
      node.makeMenu = makeMenu.bind(null, node);
      node.busy = true;
      repos.loadConfig(path, hash, onConfig);
      return node;

      function onConfig(err, pair) {
        if (err) fail(node, err);
        config = pair.config;
        repo = pair.repo;
        node.hash = config.current;
        if (config.current !== config.head) {
          node.staged = true;
        }
        if (openPaths[repoPath]) openTree(node);
        else node.busy = false;
      }
    }

    function renderChildren(parent, tree) {
      Object.keys(tree).forEach(function (name) {
        var entry = tree[name];
        var path = parent.path + "/" + name;
        var child;
        if (entry.mode === modes.commit) {
          child = renderRepo(path, entry.hash);
        }
        else {
          child = makeRow(path, entry.mode, entry.hash, parent);
          child.onClick = onClick.bind(null, child);
          child.makeMenu = makeMenu.bind(null, child);

          if (openPaths[path]) openTree(child);
        }
        parent.addChild(child);
      });
    }

    function onClick(node) {
      if (modes.isBlob(node.mode)) {
        console.log("TODO: open file");
      }
      else {
        if (node.open) closeTree(node);
        else openTree(node);
      }
    }



    // function onChanger(path) {
    //   var localPath = path.substr(repoPath.length + 1);
    //   return function (hash) {
    //     updateTree(commitNode, [{
    //       path: localPath,
    //       mode: modes.commit,
    //       hash: hash
    //     }]);
    //   };
    // }

    // function onTreeClicker(path, hash, $) {
    //   return function (evt) {
    //     nullify(evt);
    //     if (openPaths[path]) closeTree(path, hash, $);
    //     else openTree(path, hash, $);
    //   };
    // }

    function openTree(node) {
      if (node.open) return;
      node.busy = true;
      openPaths[node.path] = true;
      prefs.save();
      if (node.mode === modes.commit) {
        return repo.loadAs("commit", node.hash, onCommit);
      }
      return repo.loadAs("tree", node.hash, onTree);

      function onCommit(err, commit) {
        if (!commit) fail(node, err || new Error("Missing commit"));
        node.treeHash = commit.tree;
        return repo.loadAs("tree", commit.tree, onTree);
      }

      function onTree(err, tree) {
        if (!tree) fail(node, err || new Error("Missing tree"));
        node.open = true;
        renderChildren(node, tree);
        node.busy = false;
      }
    }

    function closeTree(node) {
      if (!node.open) return;
      delete openPaths[node.path];
      prefs.save();
      node.open = false;
      node.removeChildren();
    }

    // function commitChanges(node) {
    //   var $ = node.$, current;
    //   var userEmail, userName;
    //   repo.loadAs("commit", config.current, onCurrent);

    //   function onCurrent(err, result) {
    //     if (!result) fail(node, err || new Error("Missing commit " + config.current));
    //     current = result;
    //     userName = prefs.get("userName", "");
    //     userEmail = prefs.get("userEmail", "");
    //     dialog.multiEntry("Enter Commit Message", [
    //       {name: "message", placeholder: "Details about commit.", required:true},
    //       {name: "name", placeholder: "Full Name", required:true, value:userName},
    //       {name: "email", placeholder: "email@provider.com", required:true, value:userEmail},
    //     ], onResult);
    //   }
    //   function onResult(result) {
    //     if (!result) return;
    //     if (result.name !== userName) prefs.set("userName", result.name);
    //     if (result.email !== userEmail) prefs.set("userEmail", result.email);
    //     repo.saveAs("commit", {
    //       tree: current.tree,
    //       author: {
    //         name: result.name,
    //         email: result.email
    //       },
    //       parent: config.head,
    //       message: result.message
    //     }, onSave);
    //   }

    //   function onSave(err, hash) {
    //     if (err) fail(node, err);
    //     setCurrent(hash, true);
    //   }
    // }

    // function revertChanges() {
    //   dialog.confirm("Are you sure you want to lose all uncommitted changes?", function (confirm) {
    //     if (!confirm) return;
    //     setCurrent(config.head);
    //   });
    // }

    // function checkHead(node) {
    //   var old = node.$.icon.getAttribute("class");
    //   node.$.icon.setAttribute("class", "icon-spin1 animate-spin");
    //   repo.readRef("refs/heads/master", function (err, hash) {
    //     if (!hash) fail(node, err || new Error("Missing master branch"));
    //     if (config.head !== hash) {
    //       config.head = hash;
    //       prefs.save();
    //       render();
    //     }
    //     else {
    //       node.$.icon.setAttribute("class", old);
    //     }
    //   });
    // }

    // function serveHttp(node) {
    //   startServer(repo, config, node);
    // }

    // function createFile(node) {
    //   dialog.prompt("Enter name for new file", "", function (name) {
    //     if (!name) return;
    //     updateTree(node.$, [{
    //       path: node.localPath ? node.localPath + "/" + name : name,
    //       mode: modes.file,
    //       content: ""
    //     }]);
    //   });
    // }

    // function createFolder(node) {
    //   dialog.prompt("Enter name for new folder", "", function (name) {
    //     if (!name) return;
    //     repo.saveAs("tree", [], function (err, hash) {
    //       if (err) fail(node, err);
    //       openPaths[node.path + "/" + name] = true;
    //       prefs.set("openPaths", openPaths);
    //       updateTree(node.$, [{
    //         path: node.localPath ? node.localPath + "/" + name : name,
    //         mode: modes.tree,
    //         hash: hash
    //       }]);
    //     });
    //   });
    // }

    // function createSymLink(node) {
    //   dialog.prompt("Enter name for new symlink", "", function (name) {
    //     if (!name) return;
    //     updateTree(node.$, [{
    //       path: node.localPath ? node.localPath + "/" + name : name,
    //       mode: modes.sym,
    //       content: ""
    //     }]);
    //   });
    // }

    // function addSubmodule(node) {
    //   var url, name, childPath, meta, childRepo;
    //   dialog.multiEntry("Add a submodule", [
    //     {name: "url", placeholder: "git@hostname:path/to/repo.git", required:true},
    //     {name: "name", placeholder: "localname"}
    //   ], function (result) {
    //     if (!result) return;
    //     node.$.icon.setAttribute("class", "icon-spin1 animate-spin");
    //     url = result.url;
    //     name = result.name;
    //     if (!name) {
    //       name = url.replace(/\.git$/, '');
    //       name = name.substr(name.lastIndexOf("/") + 1);
    //     }
    //     loadFile(".gitmodules", onConfig);
    //   });

    //   function onConfig(err, text) {
    //     if (err) fail(node, err);
    //     if (text) {
    //       try { meta = parseConfig(text); }
    //       catch (err) { fail(node, err); }
    //     }
    //     else {
    //       meta = {};
    //     }
    //     if (!meta.submodule) meta.submodule = {};
    //     // Assume github if user/name combo is given
    //     if (/^[a-z0-9_-]+\/[a-z0-9_-]+$/.test(url)) {
    //       url = "git@github.com:" + url + ".git";
    //     }
    //     childPath = node.localPath ? node.localPath + "/" + name : name;
    //     meta.submodule[childPath] = {
    //       path: childPath,
    //       url: url
    //     };
    //     try { childRepo = createRepo(configFromUrl(url, config)); }
    //     catch(err) { fail(node, err); }

    //     childRepo.readRef("refs/heads/master", onRef);
    //   }

    //   function onRef(err, hash) {
    //     if (err) fail(node, err);
    //     if (!hash) return clone(childRepo, url, onRef);
    //     updateTree(node.$, [
    //       { path: ".gitmodules",
    //         mode: modes.file,
    //         content: encodeConfig(meta)
    //       },
    //       { path: childPath,
    //         mode: modes.commit,
    //         hash: hash
    //       }
    //     ]);

    //   }
    // }

    // function toggleExec(node) {
    //   updateTree(node.$, [{
    //     path: node.localPath,
    //     mode: node.mode === modes.exec ? modes.file : modes.exec,
    //     hash: node.hash
    //   }]);
    // }

    // function renameEntry(node) {
    //   dialog.prompt("Enter new name", node.localPath, function (newPath) {
    //     if (!newPath || newPath === node.localPath) return;
    //     updateTree(node.$, [
    //       {path: node.localPath},
    //       {path: newPath, mode: node.mode, hash: node.hash}
    //     ]);
    //   });
    // }

    // function removeEntry(node) {
    //   dialog.confirm("Are you sure you want to remove " + node.path + "?", function (confirm) {
    //     if (!confirm) return;
    //     updateTree(node.$, [{
    //       path: node.localPath
    //     }]);
    //   });
    // }

    // function loadFile(path, callback) {
    //   repo.loadAs("commit", config.current, onCommit);

    //   function onCommit(err, commit) {
    //     if (!commit) return callback(err || new Error("Missing commit " + config.current));
    //     repo.pathToEntry(commit.tree, path, onEntry);
    //   }

    //   function onEntry(err, entry) {
    //     if (!entry) return callback(err);
    //     repo.loadAs("text", entry.hash, callback);
    //   }
    // }

    // function updateTree(node, entries) {
    //   // The current and head commits
    //   var current, head;
    //   $.icon.setAttribute("class", "icon-spin1 animate-spin");

    //   if (!config.current) fail(node, new Error("config.current is not set!"));
    //   repo.loadAs("commit", config.current, onCurrent);

    //   function onCurrent(err, commit) {
    //     if (!commit) fail(node, err || new Error("Missing commit " + config.current));
    //     current = commit;
    //     // Base the tree update on the currently saved state.
    //     entries.base = commit.tree;
    //     if (config.head === config.current) {
    //       head = current;
    //       repo.createTree(entries, onTree);
    //     }
    //     else {
    //       if (!config.head) return onHead();
    //       repo.loadAs("commit", config.head, onHead);
    //     }
    //   }

    //   function onHead(err, commit) {
    //     if (err) fail(node, err);
    //     head = commit;
    //     repo.createTree(entries, onTree);
    //   }

    //   function onTree(err, root) {
    //     if (err) fail(node, err);
    //     if (head && root === head.tree) setCurrent(config.head);
    //     else setTree(root);
    //   }
    // }

    // function setTree(root) {
    //   var $ = commitNode;
    //   $.icon.setAttribute("class", "icon-spin1 animate-spin");
    //   var commit = {
    //     tree: root,
    //     author: {
    //       name: "AutoCommit",
    //       email: "tedit@creationix.com"
    //     },
    //     message: "Uncommitted changes in tedit"
    //   };
    //   if (config.head) commit.parent = config.head;
    //   repo.saveAs("commit", commit, onCommit);

    //   function onCommit(err, result) {
    //     if (err) fail(node, err);
    //     console.log("current", result);
    //     setCurrent(result);
    //   }
    // }

    // function setCurrent(hash, isHead) {
    //   var $ = commitNode;
    //   $.icon.setAttribute("class", "icon-spin1 animate-spin");
    //   if (onChange) return onChange(hash);

    //   var ref = isHead ? "refs/heads/master" : "refs/tags/current";

    //   return repo.updateRef(ref, hash, function (err) {
    //     if (err) fail(node, err);
    //     config.current = hash;
    //     if (isHead) config.head = hash;
    //     render();
    //   });
    // }

    // function activate(node) {
    //   var old = active;
    //   if (active === node) {
    //     active = null;
    //     activePath = null;
    //   }
    //   else {
    //     active = node;
    //     activePath = node.path;
    //   }
    //   if (old) old.$.row.classList.remove("active");
    //   if (!active) return editor.setDoc();
    //   active.$.row.classList.add("active");
    //   var doc = docPaths[active.path];
    //   if (doc) {
    //     if (doc.path !== active.path) doc.setPath(active.path);
    //     if (doc.mode !== active.mode) doc.setMode(active.mode);
    //     doc.$ = node.$;
    //     if (doc.hash !== active.hash) {
    //       repo.loadAs("blob", active.hash, function (err, body) {
    //         if (err) throw err;
    //         doc.hash = active.hash;
    //         doc.setBody(body);
    //         doc.activate();
    //       });
    //     }
    //     else doc.activate();
    //   }
    //   else {
    //     repo.loadAs("blob", active.hash, function (err, body) {
    //       if (err) throw err;
    //       doc = docPaths[active.path] = newDoc(active.path, active.mode, body);
    //       doc.onBlur = function (code) {
    //         if (doc.code === code) return;
    //         updateTree(active.$, [
    //           {path:node.localPath,mode:node.mode,content:code}
    //         ]);
    //       };
    //       doc.onChange = function (code) {
    //         if (doc.code === code) active.$.row.classList.remove("dirty");
    //         else active.$.row.classList.add("dirty");
    //       };
    //       doc.hash = active.hash;
    //       doc.activate();
    //     });
    //   }
    // }


    function makeMenu(node) {
      var actions = [];
      var type;
      if (node.mode === modes.commit) {
        if (config.head !== config.current) {
          actions.push({icon:"floppy", label:"Commit Changes"});
          actions.push({icon:"ccw", label:"Revert all Changes"});
          actions.push({sep:true});
        }
        if (config.githubName) {
          actions.push({icon:"github", label:"Check for Updates"});
        }
        else {
          actions.push({icon:"download-cloud", label:"Pull from Remote"});
          actions.push({icon:"upload-cloud", label:"Push to Remote"});
        }
      }
      else {
        actions.push({icon:"globe", label:"Serve Over HTTP"});
        actions.push({icon:"hdd", label:"Live Export to Disk"});
      }
      if (node.mode === modes.tree) {
        type = "Folder";
        if (openPaths[node.path]) {
          actions.push({sep:true});
          actions.push({icon:"doc", label:"Create File"});
          actions.push({icon:"folder", label:"Create Folder"});
          actions.push({icon:"link", label:"Create SymLink"});
          actions.push({sep:true});
          actions.push({icon:"fork", label: "Add Submodule"});
          actions.push({icon:"folder", label:"Import Folder"});
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
      if (node.mode !== modes.commit) {
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
      return actions;
    }
  }


  function nullify(evt) {
    evt.preventDefault();
    evt.stopPropagation();
  }





  function createEmpty() {
    dialog.prompt("Enter name for empty repo", "", function (name) {
      if (!name) return;
      name = repos.createEmpty(name);
      openPaths[name] = true;
      render();
    });
  }

  function createFromFolder() {
    return chrome.fileSystem.chooseEntry({ type: "openDirectory"}, onEntry);

    function onEntry(entry) {
      if (!entry) return;
      var name = repos.createFromFolder(entry);
      openPaths[name] = true;
      render();
    }

  }

  function createClone() {
    dialog.multiEntry("Clone Remote Repo", [
      {name: "url", placeholder: "git@hostname:path/to/repo.git", required:true},
      {name: "name", placeholder: "localname"}
    ], function (result) {
      if (!result) return;
      var name = repos.createClone(result.url, result.name);
      openPaths[name] = true;
      render();
    });
  }

  function createGithubMount() {
    var githubToken = prefs.get("githubToken", "");
    dialog.multiEntry("Mount Github Repo", [
      {name: "path", placeholder: "user/name", required:true},
      {name: "name", placeholder: "localname"},
      {name: "token", placeholder: "Enter github auth token", required:true, value: githubToken}
    ], function (result) {
      if (!result) return;
      if (result.token !== githubToken) {
        prefs.set("githubToken", result.token);
      }
      var name = repos.createGithubMount(result.path, result.name);
      openPaths[name] = true;
      render();
    });
  }

  function removeAll() {
    indexedDB.deleteDatabase("tedit");
    var githubToken = prefs.get("githubToken", "");
    var userName = prefs.get("userName", "");
    var userEmail = prefs.get("userEmail", "");
    chrome.storage.local.clear();
    prefs.init(function () {
      console.log("Restoring user information");
      prefs.set("githubToken", githubToken);
      prefs.set("userName", userName);
      prefs.set("userEmail", userEmail);
      chrome.runtime.reload()
    });
  }

  function onGlobalContext(evt) {
    nullify(evt);
    var node = findNode(evt.target);
    var menu;
    if (node) menu = node.makeMenu();
    else menu = [
      {icon:"git", label: "Create Empty Git Repo", action: createEmpty},
      {icon:"hdd", label:"Create Repo From Folder", action: createFromFolder},
      {icon:"fork", label: "Clone Remote Repo", action: createClone},
      {icon:"github", label: "Live Mount Github Repo", action: createGithubMount},
      {icon:"ccw", label: "Remove All", action: removeAll}
    ];
    contextMenu(evt, null, menu);
  }

});