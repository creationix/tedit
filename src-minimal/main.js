"use strict";


var domChanger = require('domchanger');
var Desktop = require('./ui/desktop');

var desktop = domChanger(Desktop, document.body, {handleEvent: handleEvent});


function handleEvent() {
  console.log(arguments);
}

require('./data/config').on(function (config) {
  desktop.update(config);
});


// var xhr;
// var run = require('gen-run');
// var modes = require('js-git/lib/modes');

// var mounts = [];

// function addMount(path, repo) {
//   var i = find(path);
//   if (mounts[i] && mounts[i].path === path) {
//     throw new Error("Mount already at " + path);
//   }
//   var data = {
//     path: path,
//     repo: repo
//   };
//   i++;
//   if (i === mounts.length) mounts.push(data);
//   else mounts.splice(i, 0, data);
// }

// // Find the index of path
// // If not found, return the index of the mount that would contain path.
// function find(path) {
//   for (var i = 0; i < mounts.length; i++) {

//   }
//   var max = mounts.length - 1;
//   var min = 0;
//   // return;
//   while (min <= max) {
//     var i = ((max + min) / 2) | 0;
//     var mount = mounts[i];
//     if (mount.path === path) return i;
//     if (mount.path < path) max = i - 1;
//     else min = i + 1;
//   }
//   return min;
// }

// addMount("")
// addMount("foo/bar")
// addMount("foo")
// addMount("foo/bar/baz")
// addMount("what")
// addMount("and")

// console.log("mounts", mounts);

// function removeMount(path) {
//   for (var i = 0; i < mounts.length; i++) {
//     if (path > mounts[i].path) break;
//   }
// }



// run(function* () {
//   var token, login;
//   do {
//     token = localStorage.getItem("token");
//     if (!token) {
//       token = window.prompt("Enter github token");
//       if (!token) throw new Error("Aborted");
//       localStorage.setItem("token", token);
//     }
//     xhr = require('js-github/lib/xhr')("", token);
//     login = localStorage.getItem("login");
//     if (!login) {
//       var result = yield xhr("GET", "/user");
//       login = result.body && result.body.login;
//       if (login) {
//         localStorage.setItem("login", login);
//       }
//       else {
//         localStorage.setItem("token", (token = ""));
//       }
//     }
//   } while (!token || !login);

//   var repo = {root:""};
//   require('js-github/mixins/github-db')(repo, login + "/desktop", token);
//   require('js-git/mixins/path-to-entry')(repo);
//   require('js-git/mixins/create-tree')(repo);
//   require('js-git/mixins/formats')(repo);
//   mounts[""] = repo;

//   var tree = yield* readTree("");
//   console.log(tree);
// });

// function findRepo(path) {
//   var length = 0, root = "";
//   var repo = mounts[path];
//   if (repo) return repo;
//   var names = Object.keys(mounts);
//   for (var i = 0; i < names.length; i++) {
//     var name = names[i];
//     if (name.length > length && path.length > name.length &&
//         path.substring(0, name.length) === name &&
//         path[name.length] === "/") {
//       root = name;
//       length = name.length;
//     }
//   }
//   return mounts[root];
// }

// function* readTree(path) {
//   var repo = findRepo(path);
//     console.log(repo);
//   var commitHash = yield repo.readRef("refs/heads/master");
//   var commit = yield repo.loadAs("commit", commitHash);
//   var tree = yield repo.loadAs("tree", commit.tree);
//   console.log(tree);

// }

// VFS interface
// Get an entry from the filesystem
// {hash,mode,repo}, or just {repo} if the path doesn't exist.
// read(path) => entry
// Write a new entry to the filesystem.  Non-blocking
// Here entry is just {hash,mode}, empty for delete.
// write(path, entry)
// Wait for all writes to complete before unblocking.
// flush() =>
// Get the js-git repo instance for a given path


// Mounts interface
// mount(path, repo)
//

// Extensions interface
//