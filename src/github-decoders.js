/*global define*/
define("github-decoders", function () {

  var binary = require('binary');

  return {
    commit: decodeCommit,
    tag: decodeTag,
    tree: decodeTree,
    blob: decodeBlob,
    text: decodeText
  };

  function decodeCommit(result) {
    var typeCache = this.typeCache;
    typeCache[result.tree.sha] = "tree";
    return {
      tree: result.tree.sha,
      parents: result.parents.map(function (object) {
        typeCache[object.sha] = "commit";
        return object.sha;
      }),
      author: pickPerson(result.author),
      committer: pickPerson(result.committer),
      message: result.message
    };
  }

  function decodeTag(result) {
    this.typeCache[result.object.sha] = result.object.type;
    return {
      object: result.object.sha,
      type: result.object.type,
      tag: result.tag,
      tagger: pickPerson(result.tagger),
      message: result.message
    };
  }

  function decodeTree(result) {
    var typeCache = this.typeCache;
    var tree = {};
    result.tree.forEach(function (entry) {
      typeCache[entry.sha] = entry.type;
      tree[entry.path] = {
        mode: parseInt(entry.mode, 8),
        hash: entry.sha
      };
    });
    return tree;
  }

  function decodeBlob(result) {
    if (result.encoding === 'base64') {
      return binary.fromBase64(result.content.replace(/\n/g, ''));
    }
    if (result.encoding === 'utf-8') {
      return binary.fromUtf8(result.content);
    }
    throw new Error("Unknown blob encoding: " + result.encoding);
  }

  function decodeText(result) {
    if (result.encoding === 'base64') {
      return binary.decodeBase64(result.content.replace(/\n/g, ''));
    }
    if (result.encoding === 'utf-8') {
      return result.content;
    }
    throw new Error("Unknown blob encoding: " + result.encoding);
  }

  function pickPerson(person) {
    return {
      name: person.name,
      email: person.email,
      date: new Date(person.date)
    };
  }
});
