/*global define, chrome, indexedDB*/
/*jshint unused:strict, undef:true,trailing:true */
define("tree", function () {

  var $ = require('elements');
  var modes = require('modes');
  var domBuilder = require('dombuilder');
  var makeRow = require('row');
  var dialog = require('dialog');
  var prefs = require('prefs');
  var contextMenu = require('context-menu');
  var fail = require('fail');
  var repos = require('repos');
  var genName = repos.genName;
  var importEntry = require('importfs');
  var notify = require('notify');
  var live = require('live');

  // Memory for opened trees.  Accessed by path
  var openPaths = prefs.get("openPaths", {});

  var newDoc = require('document');
  var editor = require('editor');
  // Paths to the currently selected or active tree
  var selected, active;
  var activePath = prefs.get("activePath");
  // live docs by path
  var docPaths = {};
  // live hooks by path
  var hookPaths = {};
  // Live hooks configs by path
  var hookConfig = prefs.get("hookConfig", {});

  $.tree.addEventListener("contextmenu", onGlobalContext, false);
  $.tree.addEventListener("click", onGlobalClick, false);

  render();


  function updatePaths(oldPath, newPath) {
    var reg = new RegExp("^" + oldPath.replace(/([.?*+^$[\]\\(){}|])/g, "\\$1") + "(?=/|$)");
    if (reg.test(activePath)) {
      var doc = docPaths[activePath];
      activePath = activePath.replace(reg, newPath);
      prefs.set("activePath", activePath);
      doc.updatePath(activePath);
    }
    updateGroup(openPaths, reg, newPath);
    updateGroup(docPaths, reg, newPath);
    updateGroup(hookPaths, reg, newPath); // TODO: updataPath on hooks
    updateGroup(hookConfig, reg, newPath);
    // TODO: rename paths in repos.js
    // TODO: rename paths in live.js
    prefs.save();
  }

  function updateGroup(group, reg, rep) {
    Object.keys(group).forEach(function (key) {
      if (!reg.test(key)) return;
      group[key.replace(reg, rep)] = group[key];
      delete group[key];
    });
  }

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

  function onGlobalContext(evt) {
    nullify(evt);
    var node = findNode(evt.target);
    contextMenu(evt, node, node ? node.makeMenu() : [
      {icon:"git", label: "Create Empty Git Repo", action: createEmpty},
      {icon:"hdd", label:"Create Repo From Folder", action: createFromFolder},
      {icon:"fork", label: "Clone Remote Repo", action: createClone},
      {icon:"github", label: "Live Mount Github Repo", action: createGithubMount},
      {icon:"ccw", label: "Remove All", action: removeAll}
    ]);
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

  function renderRepo(repoPath, repoHash, onChange) {
    var config, repo;
    var root = renderCommit(repoPath, repoHash);
    return root;

    function makeNewRow(path, mode, hash, parent) {
      var node = makeRow(path, mode, hash, parent);
      node.localPath = path.substring(repoPath.length + 1);
      node.onClick = onClick.bind(null, node);
      node.makeMenu = makeMenu.bind(null, node);
      if (docPaths[path]) linkDoc(node, docPaths[path]);
      if (hookConfig[path]) {
        console.log(path, hookConfig[path]);
        var hook = hookPaths[path];
        if (hook) hook(node, config);
        else hookPaths[path] = live.addExportHook(node, hookConfig[path], config);
      }
      if (hookPaths[path]) hookPaths[path](node, config);
      if (activePath === path) {
        activate(node);
      }
      return node;
    }

    // Render the UI for repo and submodule roots
    function renderCommit(path, hash) {
      var node = makeNewRow(path, modes.commit, hash);
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
          child = renderRepo(path, entry.hash, onChildChanged.bind(null, path.substring(repoPath.length + 1)));
        }
        else {
          child = makeNewRow(path, entry.mode, entry.hash, parent);
          if (openPaths[path]) openTree(child);
        }
        parent.addChild(child);
      });
    }

    function onChildChanged(path, child, hash) {
      child.busy = true;
      updateTree(root, [{
        path: path,
        mode: modes.commit,
        hash: hash
      }]);
    }

    function onClick(node) {
      if (modes.isFile(node.mode)) {
        if (active === node) activate();
        else activate(node);
      }
      else if (node.mode === modes.sym) {
        editSymLink(node);
      }
      else toggleTree(node);
    }

    function activate(node) {
      var old = active;
      active = node;
      activePath = active ? active.path : null;
      prefs.set("activePath", activePath);
      if (old) old.active = false;
      if (active) active.active = true;
      if (!active) return editor.setDoc();
      if (active === old) return;
      var doc;
      node.busy = true;
      return repo.loadAs("blob", node.hash, onBlob);
      function onBlob(err, blob) {
        if (err) fail(node, err);
        doc = docPaths[node.path];
        try {
          if (doc) doc.update(node.path, node.mode, blob);
          else doc = docPaths[node.path] = newDoc(node.path, node.mode, blob);
          linkDoc(node, doc);
          doc.activate();
        }
        catch (err) {
          fail(node, err);
        }
        node.busy = false;
      }
    }

    function linkDoc(node, doc) {
      doc.updateTree = function (text) {
        updateTree(node, [{
          path: node.localPath,
          mode: node.mode,
          content: text
        }]);
      };
    }

    function editSymLink(node) {
      repo.loadAs("text", node.hash, function (err, target) {
        if (err) fail(node, err);
        dialog.multiEntry("Edit SymLink", [
          {name: "target", placeholder: "target", required:true, value:target},
          {name: "path", placeholder: "path", required:true, value:node.localPath},
        ], onResult);
      });
      
      function onResult(result) {
        if (!result) return;
        var entries = [{
          path: result.path,
          mode: modes.sym,
          content: result.target
        }];
        if (result.path !== node.localPath) {
          entries.push({
            path: node.localPath
          });
        }
        updateTree(node, entries);
      }
    }

    function toggleTree(node) {
      if (node.open) closeTree(node);
      else openTree(node);
    }

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

    function commitChanges(node) {
      var current;
      var userEmail, userName;
      repo.loadAs("commit", config.current, onCurrent);

      function onCurrent(err, result) {
        if (!result) fail(node, err || new Error("Missing commit " + config.current));
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
        if (err) fail(node, err);
        setCurrent(node, hash, true);
      }
    }

    function revertChanges(node) {
      dialog.confirm("Are you sure you want to lose all uncommitted changes?", function (confirm) {
        if (!confirm) return;
        setCurrent(node, config.head);
      });
    }

    function checkHead(node) {
      node.busy = true;
      repo.readRef("refs/heads/master", function (err, hash) {
        if (!hash) fail(node, err || new Error("Missing master branch"));
        if (config.head !== hash) {
          config.head = hash;
          prefs.save();
          render();
        }
        else {
          node.busy = false;
        }
      });
    }

    // function serveHttp(node) {
    //   startServer(repo, config, node);
    // }

    function liveExport(node) {
      dialog.exportConfig({
        entry: prefs.get("defaultExportEntry"),
        source: node.path,
        filters: "filters",
        name: node.path.substring(node.path.indexOf("/") + 1)
      }, function (settings) {
        if (!settings) return;
        prefs.set("defaultExportEntry", settings.entry);
        var hook = live.addExportHook(node, settings, config);
        hookConfig[settings.source] = settings;
        hookPaths[settings.source] = hook;
        prefs.save();
      });
    }

    function getUnique(parent, name, callback) {
      repo.loadAs("tree", parent.treeHash || parent.hash, function (err, tree) {
        if (!tree) return callback(err || new Error("Missing tree"));
        name = genName(name, tree);
        callback(null, name);
      });
    }

    function createNode(node, message, entry) {
      dialog.prompt(message, "", function (name) {
        if (!name) return;
        getUnique(node, name, function (err, name) {
          if (err) fail(node, err);
          entry.path = node.localPath ? node.localPath + "/" + name : name;
          if (entry.mode === modes.tree) {
            repo.saveAs("tree", entry.content, function (err, hash) {
              if (err) fail(node, err);
              openPaths[repoPath + "/" + entry.path] = true;
              delete entry.content;
              entry.hash = hash;
              updateTree(node, [entry]);
            });
          }
          else updateTree(node, [entry]);
        });
      });
    }

    function createFile(node) {
      createNode(node, "Enter name for new file", {
        mode: modes.file,
        content: ""
      });
    }

    function createFolder(node) {
      createNode(node, "Enter name for new folder", {
        mode: modes.tree,
        content: []
      });
    }

    function createSymLink(node) {
      dialog.multiEntry("Create SymLink", [
        {name: "target", placeholder: "target", required:true},
        {name: "name", placeholder: "name", required:true},
      ], onResult);
      
      function onResult(result) {
        if (!result) return;
        getUnique(node, result.name, function (err, name) {
          if (err) fail(node, err);
          updateTree(node, [{
            path: node.localPath ? node.localPath + "/" + name : name,
            mode: modes.sym,
            content: result.target
          }]);
        });
      }
    }

    function importFolder(node) {
      return chrome.fileSystem.chooseEntry({ type: "openDirectory"}, onEntry);

      function onEntry(entry) {
        if (!entry) return;
        node.busy = true;
        getUnique(node, entry.name, function (err, name) {
          if (err) fail(node, err);
          importEntry(repo, entry, function (err, hash) {
            if (err) fail(node, err);
            var path = node.localPath ? node.localPath + "/" + name : name;
            openPaths[repoPath + "/" + path] = true;
            updateTree(node, [{
              path: path,
              mode: modes.tree,
              hash: hash
            }]);
          });
        });
      }
    }

    function addSubmodule(node) {
      var url, name;
      dialog.multiEntry("Add a submodule", [
        {name: "url", placeholder: "git@hostname:path/to/repo.git", required:true},
        {name: "name", placeholder: "localname"}
      ], function (result) {
        if (!result) return;
        node.busy = true;
        url = result.url;
        name = result.name;
        // Assume github if user/name combo is given
        if (/^[^\/:@]+\/[^\/:@]+$/.test(url)) {
          url = "git@github.com:" + url + ".git";
        }
        repos.addSubModule(repoPath, config, url, node.localPath, name, onEntries);
      });

      function onEntries(err, entries) {
        if (err) fail(node, err);
        updateTree(node, entries);
      }
    }

    function toggleExec(node) {
      updateTree(node, [{
        path: node.localPath,
        mode: node.mode === modes.exec ? modes.file : modes.exec,
        hash: node.hash
      }]);
    }

    function renameEntry(node) {
      dialog.prompt("Enter new name", node.localPath, function (newPath) {
        if (!newPath || newPath === node.localPath) return;
        updatePaths(node.path, repoPath + "/" + newPath);
        updateTree(node, [
          {path: node.localPath},
          {path: newPath, mode: node.mode, hash: node.hash}
        ]);
      });
    }

    function removeEntry(node) {
      dialog.confirm("Are you sure you want to remove " + node.path + "?", function (confirm) {
        if (!confirm) return;
        updateTree(node, [{
          path: node.localPath
        }]);
      });
    }

    function updateTree(node, entries) {
      // The current and head commits
      var current, head;
      node.busy = true;

      if (!config.current) fail(node, new Error("config.current is not set!"));
      repo.loadAs("commit", config.current, onCurrent);

      function onCurrent(err, commit) {
        if (!commit) fail(node, err || new Error("Missing commit " + config.current));
        current = commit;
        // Base the tree update on the currently saved state.
        entries.base = commit.tree;
        if (config.head === config.current) {
          head = current;
          repo.createTree(entries, onTree);
        }
        else {
          if (!config.head) return onHead();
          repo.loadAs("commit", config.head, onHead);
        }
      }

      function onHead(err, commit) {
        if (err) fail(node, err);
        head = commit;
        repo.createTree(entries, onTree);
      }

      function onTree(err, root) {
        if (err) fail(node, err);
        if (head && root === head.tree) setCurrent(node, config.head);
        else setTree(node, root);
      }
    }

    function setTree(node, root) {
      node.busy = true;
      var commit = {
        tree: root,
        author: {
          name: "AutoCommit",
          email: "tedit@creationix.com"
        },
        message: "Uncommitted changes in tedit"
      };
      if (config.head) commit.parent = config.head;
      repo.saveAs("commit", commit, onCommit);

      function onCommit(err, result) {
        if (err) fail(node, err);
        setCurrent(node, result);
      }
    }

    function setCurrent(node, hash, isHead) {
      node.busy = true;
      if (onChange) return onChange(root, hash);

      var ref = isHead ? "refs/heads/master" : "refs/tags/current";

      return repo.updateRef(ref, hash, function (err) {
        if (err) fail(node, err);
        if (isHead) {
          config.head = hash;
          return setCurrent(node, hash);
        }
        else {
          config.current = hash;
        }
        render();
      });
    }

    function makeMenu(node) {
      var actions = [];
      var type;
      actions.push({icon:"globe", label:"Serve Over HTTP"});
      actions.push({icon:"hdd", label:"Live Export to Disk", action: liveExport});
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
        type = "Folder";
        if (openPaths[node.path]) {
          actions.push({sep:true});
          actions.push({icon:"doc", label:"Create File", action: createFile});
          actions.push({icon:"folder", label:"Create Folder", action: createFolder});
          actions.push({icon:"link", label:"Create SymLink", action: createSymLink});
          actions.push({sep:true});
          actions.push({icon:"fork", label: "Add Submodule", action: addSubmodule});
          actions.push({icon:"folder", label:"Import Folder", action: importFolder});
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
      if (node.mode !== modes.commit) {
        actions.push({sep:true});
        if (node.path.indexOf("/") >= 0) {
          actions.push({icon:"pencil", label:"Rename " + type, action: renameEntry});
          actions.push({icon:"trash", label:"Delete " + type, action: removeEntry});
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
    prefs.clearSync(["treeConfig", "openPaths", "hookConfig"], chrome.runtime.reload);
  }

});