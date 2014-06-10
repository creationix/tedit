define("js-github/examples/readme-caps.js", ["js-github/mixins/github-db.js","js-git/mixins/create-tree.js","js-git/mixins/mem-cache.js","js-git/mixins/read-combiner.js","js-git/mixins/formats.js","gen-run.js"], function (module, exports) { var repo = {};

// This only works for normal repos.  Github doesn't allow access to gists as
// far as I can tell.
var githubName = "creationix/js-github";

// Your user can generate these manually at https://github.com/settings/tokens/new
// Or you can use an oauth flow to get a token for the user.
var githubToken = "8fe7e5ad65814ea315daad99b6b65f2fd0e4c5aa";

// Mixin the main library using github to provide the following:
// - repo.loadAs(type, hash) => value
// - repo.saveAs(type, value) => hash
// - repo.readRef(ref) => hash
// - repo.updateRef(ref, hash) => hash
// - repo.createTree(entries) => hash
// - repo.hasHash(hash) => has
require('js-github/mixins/github-db.js')(repo, githubName, githubToken);


// Github has this built-in, but it's currently very buggy so we replace with
// the manual implementation in js-git.
require('js-git/mixins/create-tree.js')(repo);

// Cache everything except blobs over 100 bytes in memory.
// This makes path-to-hash lookup a sync operation in most cases.
require('js-git/mixins/mem-cache.js')(repo);

// Combine concurrent read requests for the same hash
require('js-git/mixins/read-combiner.js')(repo);

// Add in value formatting niceties.  Also adds text and array types.
require('js-git/mixins/formats.js')(repo);

// I'm using generator syntax, but callback style also works.
// See js-git main docs for more details.
var run = require('gen-run.js');
run(function* () {
  var headHash = yield repo.readRef("refs/heads/master");
  var commit = yield repo.loadAs("commit", headHash);
  var tree = yield repo.loadAs("tree", commit.tree);
  var entry = tree["README.md"];
  var readme = yield repo.loadAs("text", entry.hash);

  // Build the updates array
  var updates = [
    {
      path: "README.md", // Update the existing entry
      mode: entry.mode,  // Preserve the mode (it might have been executible)
      content: readme.toUpperCase() // Write the new content
    }
  ];
  // Based on the existing tree, we only want to update, not replace.
  updates.base = commit.tree;

  // Create the new file and the updated tree.
  var treeHash = yield repo.createTree(updates);

  var commitHash = yield repo.saveAs("commit", {
    tree: treeHash,
    author: {
      name: "Tim Caswell",
      email: "tim@creationix.com"
    },
    parent: headHash,
    message: "Change README.md to be all uppercase using js-github"
  });

  // Now we can browse to this commit by hash, but it's still not in master.
  // We need to update the ref to point to this new commit.
  console.log("COMMIT", commitHash)
  yield repo.updateRef("refs/heads/master", commitHash);
});

});
