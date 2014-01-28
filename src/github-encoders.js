/*global define*/
define("github-encoders", function () {

  var binary = require('binary');

  var modeToType = {
    "040000": "tree",
    "100644": "blob",  // normal file
    "100655": "blob",  // executable file
    "120000": "blob",  // symlink
    "160000": "commit" // gitlink
  };

  return {
    commit: encodeCommit,
    tag: encodeTag,
    tree: encodeTree,
    blob: encodeBlob
  };

  function encodeCommit(commit) {
    var out = {};
    out.message = commit.message;
    out.tree = commit.tree;
    if (commit.parents) out.parents = commit.parents;
    else if (commit.parent) out.parents = [commit.parent];
    else commit.parents = [];
    if (commit.author) out.author = encodePerson(commit.author);
    if (commit.committer) out.committer = encodePerson(commit.committer);
    return out;
  }

  function encodeTag(tag) {
    return {
      tag: tag.tag,
      message: tag.message,
      object: tag.object,
      tagger: encodePerson(tag.tagger)
    };
  }

  function encodePerson(person) {
    return {
      name: person.name,
      email: person.email,
      date: (person.date || new Date()).toISOString()
    };
  }

  function encodeTree(tree) {
    return {
      tree: Object.keys(tree).map(function (name) {
        var entry = tree[name];
        var mode = entry.mode.toString(8);
        // Github likes all modes to be 6 length
        if (mode.length === 5) mode = "0" + mode;
        return {
          path: name,
          mode: mode,
          type: modeToType[mode],
          sha: entry.hash
        };
      })
    };
  }

  function encodeBlob(blob) {
    if (typeof blob === "string") return {
      content: binary.encodeUtf8(blob),
      encoding: "utf-8"
    };
    if (binary.isBinary(blob)) return {
      content: binary.toBase64(blob),
      encoding: "base64"
    };
    throw new TypeError("Invalid blob type, must be binary of string");
  }
});
