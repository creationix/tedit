/*global define*/
define("tree", function () {
  "use strict";

  var $ = require('elements');
  var getMime = require('mime')();
  var domBuilder = require('dombuilder');
  var modes = require('modes');
  require('repos')(function (err, repo, root, entry) {
    if (err) throw err;
    repo.name = entry.fullPath;
    $.tree.appendChild(domBuilder(["ul", makeTree(repo, root, entry.name).el]));
  });

  var selected;

  function makeTree(repo, rootHash, name) {
    var root;

    function GenericNode(mode, name, hash, parent, originalHash) {
      // The gitmode should always be 040000 for Trees
      // and 0100644 or 0100755 for files.
      this.mode = mode;
      // The name of this entry within it's parent.
      this.name = name;
      // The hash of this entry in git.
      this.hash = hash;
      // The hash at this location in the last commit tree.
      this.originalHash = originalHash;
      // A reference to the parent tree if any.
      this.parent = parent;
      // Calculate the path.
      this.path = parent ? parent.path + "/" + name : "";
      // The raw body from js-git of what's stored in hash
      // Used for dirty checking.
      this.value = null;
      // Build uio elements
      domBuilder(["li$el",
        ["$rowEl", { onclick: onClick(this) },
          ["i$iconEl"], ["span$nameEl"]
        ]
      ], this);
      this.el.js = this;
      this.onChange();
    }

    GenericNode.prototype.onChange = function (recurse) {
      var title = this.path;
      var classes = ["row"];
      if (this.isDirty()) {
        title += " (dirty)";
        classes.push("dirty");
      }
      if (this.isStaged()) {
        title += " (staged)";
        classes.push("staged");
      }
      if (selected === this) classes.push("selected");
      this.rowEl.setAttribute('class', classes.join(" "));
      classes.length = 0;
      if (!this.parent) {

        // var meta = repos[this.name];
        // var url = repo.remote && repo.remote.href;
        // if (meta.github) url = "github://" + meta.github;
        // title = repo.name(url || meta.name) + title;
        // if (/\bgithub\b/.test(url)) classes.push("icon-github");
        // else if (/\bbitbucket\b/.test(url)) classes.push("icon-bitbucket");
        // else if (url) classes.push("icon-box");
      }
      if (modes.isExecutable(this.mode)) {
        classes.push("executable");
        title += " (executable)";
      }
      this.nameEl.textContent = this.name;
      this.nameEl.setAttribute('class', classes.join(" "));
      this.nameEl.setAttribute('title', title);
      classes.length = 0;
      if (modes.isTree(this.mode)) {
        // Root tree gets a box icon since it represents the repo.
        if (!this.parent) {
          if (this.children) classes.push("icon-book-open");
          else classes.push("icon-book");
        }

        // Tree nodes with children are open
        else if (this.children) classes.push("icon-folder-open");
        // Others are closed.
        else classes.push("icon-folder");
      }
      else if (modes.isFile(this.mode)) {
        var mime = getMime(this.name);
        if (/(?:\/json$|^text\/)/.test(mime)) {
          classes.push("icon-doc-text");
        }
        else if (/^image\//.test(mime)) {
          classes.push("icon-picture");
        }
        else if (/^video\//.test(mime)) {
          classes.push("icon-video");
        }
        else {
          classes.push("icon-doc");
        }
      }
      else if (modes.isSymLink(this.mode)) {
        classes.push("icon-link");
        this.nameEl.appendChild(domBuilder(["span.target", this.target]));
      }
      else {
        console.error("Invalid mode", this);
      }
      this.iconEl.setAttribute('class', classes.join(" "));
      this.iconEl.setAttribute('title', this.hash);
      if (recurse && this.children) {
        this.children.forEach(function (child) {
          child.onChange(true);
        });
      }
    };

    GenericNode.prototype.isStaged = function () {
      return this.hash !== this.originalHash;
    };

    GenericNode.prototype.load = function (type) {
      var self = this;
      if (!this.hash) {
        if (type === "tree") this.value = [];
        else this.value = "";
        return this.onClick();
      }
      return repo.loadAs(type, this.hash, function (err, value) {
        if (err) return self.onError(err);
        self.value = value;
        return self.onClick();
      });
    };

    function TreeNode(mode, name, hash, parent, originalHash) {
      GenericNode.apply(this, arguments);
      this.el.appendChild(domBuilder(["ul$ul"], this));
      this.children = null;
    }

    TreeNode.prototype = Object.create(GenericNode.prototype, {
      constructor: { value: TreeNode }
    });

    TreeNode.prototype.isDirty = function () {
      if (!this.hash) return true;
      if (this.value === null || this.children === null) return false;
      var length = this.value.length;
      if (this.children.length !== length) return true;
      this.value.sort(byName);
      this.children.sort(byName);
      for (var i = 0; i < length; i++) {
        var child = this.children[i];
        var entry = this.value[i];
        if (child.mode !== entry.mode) return true;
        if (child.name !== entry.name) return true;
        if (child.hash !== entry.hash) return true;
      }
      return false;
    };

    TreeNode.prototype.orderChildren = function () {
      this.children.sort(folderFirst);
      this.ul.textContent = "";
      this.ul.appendChild(domBuilder(this.children.map(getEl)));
    };

    TreeNode.prototype.childFromEntry = function (name, entry, callback) {
      if (entry.originalHash === undefined) {
        if (!this.originalHash) {
          entry.originalHash = null;
        }
        else if (this.hash === this.originalHash) {
          entry.originalHash = entry.hash;
        }
        else {
          var self = this;
          return this.repo.loadAs("tree", this.originalHash, function (err, tree) {
            if (err) throw err;
            var old = findByName(tree, name);
            entry.originalHash = old ? old.hash : null;
            return self.childFromEntry(entry, callback);
          });
        }
      }
      var Constructor;
      if (modes.isTree(entry.mode)) Constructor = TreeNode;
      else if (modes.isFile(entry.mode)) Constructor = FileNode;
      else if (modes.isSymLink(entry.mode)) Constructor = SymLinkNode;
      else throw "TODO: Implement more mode types";
      var child = new Constructor(entry.mode, name, entry.hash, this, entry.originalHash);
      callback(null, child);
    };

    TreeNode.prototype.onClick = function () {
      if (this.value === null) return this.load("tree");
      console.log(this);

      // If we're already open, we need to close the folder
      if (this.children) {
        // If selected is a descendent, deselect it.
        this.clearChildren();

        // If there are any dirty descendents, we can't close.
        if (this.isDirty() || this.children && this.hasDirtyChildren()) {
          this.stageChanges();

          return;
        }


        // TODO walk children saving any outstanding changes.
        // First remove all children of the ul.
        this.ul.textContent = "";
        this.children = null;
        // delete repos[repo.name].opened[this.path];
        // prefs.set("repos", repos);
        return this.onChange();
      }

      var self = this;
      // Create UI instances for the children.
      var keys = Object.keys(this.value);
      var left = keys.length + 1;
      var children = new Array(keys.length);
      keys.forEach(function (key, i) {
        self.childFromEntry(key, self.value[key], function (err, child) {
          if (err) throw err;
          children[i] = child;
          check();
        });
      });
      check();
      function check() {
        if (--left) return;
        self.children = children;
        // Put folders first.
        self.orderChildren();
        // repos[self.repo.name].opened[self.path] = true;
        // prefs.set("repos", repos);
        self.onChange();
      }
    };

    function FileNode(mode, name, hash, parent, originalHash) {
      GenericNode.apply(this, arguments);
    }

    FileNode.prototype = Object.create(GenericNode.prototype, {
      constructor: { value: FileNode }
    });

    FileNode.prototype.isDirty = function () {
      return !this.hash || this.doc && this.value !== null && this.value !== this.doc.getValue();
    };

    root = new TreeNode(modes.tree, name, rootHash, null, rootHash);
    return root;
  }

  function getEl(node) { return node.el; }

  // Generic click helper that routes click events to the right instance.
  function onClick(node) {
    return function (evt) {
      if (typeof node.onClick !== "function") return;
      evt.preventDefault();
      evt.stopPropagation();
      node.onClick();
    };
  }

  // Quick sort function that puts folders first by abusing their low mode value.
  function folderFirst(a, b) {
    if (a.mode !== b.mode) return a.mode - b.mode;
    // Fallback to sorted by name.
    return byName(a, b);
  }

  // Sort using the same algorithm git uses internally to build trees
  function byName(a, b) {
    a = a.name + "/";
    b = b.name + "/";
    return a < b ? -1 : a > b ? 1 : 0;
  }


  // // Put fake content in the tree
  // $.tree.innerHTML = '
  /*
  <ul>
    <li>
      <div class="row staged">
        <i class="icon-book-open" title="2ea165d87803f2dc521669333a3d4b9d48a0b2fa"></i>
        <span class="icon-github" title="github://creationix/tedit (staged)">creationix/tedit</span>
      </div>
      <ul>
        <li>
          <div class="row">
            <i class="icon-folder-open" title="bd81e604a76cde7e96ddca552758930e89d222e2"></i>
            <span class="" title="/amd">amd</span>
          </div>
          <ul>
            <li>
              <div class="row">
                <i class="icon-link" title="8af9d5a8c298290a2590be4ab9f38f02115bc7c4"></i>
                <span class="" title="/amd/{name}.js">{name}.js<span class="target">../src/{name}.js|amd</span></span>
              </div>
            </li>
          </ul>
        </li>
        <li>
          <div class="row">
            <i class="icon-folder" title="0fc01fdbabc0ff1818bf7a276ead8c8dad12381d"></i>
            <span class="" title="/filters">filters</span>
          </div>
          <ul></ul>
        </li>
        <li>
          <div class="row">
            <i class="icon-folder" title="2d985ab6d089a431500de401c9bc3325882119a5"></i>
            <span class="" title="/modules">modules</span>
          </div>
          <ul></ul>
        </li>
        <li>
          <div class="row staged">
            <i class="icon-folder-open" title="a07c67f979b858b641dcdf5471ab9bdc0215d5b5"></i>
            <span class="" title="/src (staged)">src</span>
          </div>
          <ul>
            <li>
              <div class="row">
                <i class="icon-doc-text" title="681b9cc4f55e97a3c35a0e6245f45c82a94d1d5f"></i>
                <span class="" title="/src/Cell.js">Cell.js</span>
              </div>
            </li>
            <li>
              <div class="row">
                <i class="icon-doc-text" title="392ccb0769396ae6fe4c64f1620d4da512e33dd7"></i>
                <span class="" title="/src/Editor.js">Editor.js</span>
              </div>
            </li>
            <li>
              <div class="row">
                <i class="icon-doc-text" title="b71a941b47fbb5cf1749a137164c79d3334b6b57"></i>
                <span class="" title="/src/LogView.js">LogView.js</span>
              </div>
            </li>
            <li>
              <div class="row">
                <i class="icon-doc-text" title="2267aa0956580320a560357e5c9ea9f9f3fd420e"></i>
                <span class="" title="/src/SplitView.js">SplitView.js</span>
              </div>
            </li>
            <li><div class="row"><i class="icon-doc-text" title="c81b55e54bfbefbaf512a14d5b6049bb2c971b1a"></i><span class="" title="/src/TreeView.js">TreeView.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="01691daa38ece7813ca620b26b73363f770a212b"></i><span class="" title="/src/ambiance.less">ambiance.less</span></div></li><li><div class="row"><i class="icon-doc-text" title="d6139bbae30d55ccdb4c4cc7481989fdbd67ef66"></i><span class="" title="/src/app.js">app.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="7ba59a3d12e419d3bd1d2396d225619e5a79a306"></i><span class="" title="/src/background.js">background.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="17e0e55351687e0dff7e6eaaad6434b145f24a9d"></i><span class="" title="/src/chrome-prefs.js">chrome-prefs.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="06a3c927d40f7d3a456ba7fd747b80a62de7d2f8"></i><span class="" title="/src/chrome-tcp.js">chrome-tcp.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="3076c534697f8c4b4e83e08ddcd8795e088933ed"></i><span class="" title="/src/chrome.js">chrome.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="0ed4b9effe17233b0006fbc94323764f26f5aa4c"></i><span class="" title="/src/codemirror.js">codemirror.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="d42ea9f2b304d7c02c34f2c9ce7e82e434866ce7"></i><span class="" title="/src/codemirror.less">codemirror.less</span></div></li><li><div class="row"><i class="icon-doc-text" title="7de8d68c62aa3a622cb613b000da16186fa3e529"></i><span class="" title="/src/fs.js">fs.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="8873d2227a3c9608394445ef01c32f2fff44d8cd"></i><span class="" title="/src/gitfs.js">gitfs.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="f8e2fa8cb061b8b6680d42bc2d452097efca865c"></i><span class="" title="/src/github-config.js">github-config.js</span></div></li><li><div class="row"><i class="icon-picture" title="9ec06667baa5406b27f494d16d6f499918416215"></i><span class="" title="/src/icon-128.png">icon-128.png</span></div></li><li><div class="row"><i class="icon-picture" title="5c3b214272a12cf5bee56f476f5a8d348864e744"></i><span class="" title="/src/icon-196.png">icon-196.png</span></div></li><li><div class="row"><i class="icon-doc-text" title="14e69cad3d5da6133cf870d58468d0491d76a568"></i><span class="" title="/src/icons.less">icons.less</span></div></li><li><div class="row staged"><i class="icon-doc-text" title="e90cd0f99e0a89d5aa02b178787a0384ea94ecc7"></i><span class="" title="/src/index.html (staged)">index.html</span></div></li><li><div class="row"><i class="icon-doc-text" title="de6f540cd5095f31972dddb0bed410ef150e56ab"></i><span class="" title="/src/manifest.json">manifest.json</span></div></li><li><div class="row"><i class="icon-doc-text" title="98954b3f0dcb42a67c41b6da0dfbee6d4a86ccea"></i><span class="" title="/src/mime.js">mime.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="2b471846e6dbfb788c2e5e94f4e1b92f0d7ab742"></i><span class="" title="/src/prefs.js">prefs.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="8149e59470ae40c68f25eb60df6665c6a7e18db4"></i><span class="" title="/src/progress-parser.js">progress-parser.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="e8b83bb248a4303588b3efb7a4f7ae828827bccd"></i><span class="" title="/src/run.js">run.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="c0453addded00a3d681b4d0abae5825a80cd3566"></i><span class="" title="/src/runtime.js">runtime.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="b21df3541e6f8267d03e639977c5e8e9386c6803"></i><span class="" title="/src/sample.js">sample.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="1065719fc6601bc67c9a30332067374c9e795b0e"></i><span class="" title="/src/serial.js">serial.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="bb0a9d77e68c220285f276d87fbe52afb89a0eb0"></i><span class="" title="/src/server.js">server.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="80e4076e75bc6e3395f0aa99ff3e7f417dea4725"></i><span class="" title="/src/splitview.less">splitview.less</span></div></li><li><div class="row"><i class="icon-doc-text" title="98db96b278b6718161876b8150ed6d1139599b55"></i><span class="" title="/src/style.less">style.less</span></div></li><li><div class="row"><i class="icon-doc-text" title="7e838f2fd50924e8b7c598573b8a3aa090ded879"></i><span class="" title="/src/template.js">template.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="59098ab58cf9438571d9a3543128ef64c3610a36"></i><span class="" title="/src/walk.js">walk.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="8960579de1f805eb4e090884b45c0a13ad282d1e"></i><span class="" title="/src/web.js">web.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="377be65844a0428ff5d47023194fa23347bc5386"></i><span class="" title="/src/welcome.js">welcome.js</span></div></li></ul></li><li><div class="row"><i class="icon-doc-text" title="09977212be2f52035e3da9a1dc9f3f4fd1fd189d"></i><span class="" title="/manifest.txt">manifest.txt</span></div></li><li><div class="row staged"><i class="icon-doc-text" title="e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"></i><span class="" title="/require.js (staged)">require.js</span></div></li><li><div class="row"><i class="icon-doc-text" title="41ee67169834deeb326b2225dcdf5b840f935f9c"></i><span class="" title="/style.css">style.css</span></div></li><li><div class="row"><i class="icon-link" title="3bf61af7b494200044d9b935085554b0a47f04ab"></i><span class="" title="/app.js">app.js<span class="target">src/web.js|cjs</span></span></div></li><li><div class="row"><i class="icon-link" title="a0f3d6f3308b0fe8c177092430aa442b339a8f1a"></i><span class="" title="/github-callback">github-callback<span class="target">|github-callback</span></span></div></li><li><div class="row"><i class="icon-link" title="e321c2aab074d9aa3c927a05c62dd73907a2b4c8"></i><span class="" title="/index.html">index.html<span class="target">src/index.html</span></span></div></li><li><div class="row"><i class="icon-link" title="84ed66d17a3eb4e9a320818b5a4a5b6c38712791"></i><span class="" title="/manifest.appcache">manifest.appcache<span class="target">manifest.txt|appcache</span></span></div>
        </li>
      </ul>
    </li>
  </ul>
  */

  function focus() {
    console.log("TODO: focus");
  }

  return {
    focus: focus
  };
});
