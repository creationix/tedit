/*global define*/
define("encoders", function () {
  var sha1 = require('sha1');
  var binary = require('binary');

  // Run sanity tests at startup.
  test();

  return {
    frame: frame,
    normalizeAs: normalizeAs,
    normalizeBlob: normalizeBlob,
    normalizeTree: normalizeTree,
    normalizeCommit: normalizeCommit,
    normalizeTag: normalizeTag,
    encodeAs: encodeAs,
    encodeBlob: encodeBlob,
    encodeTree: encodeTree,
    encodeCommit: encodeCommit,
    encodeTag: encodeTag,
    hashAs: hashAs,
    hashBlob: hashBlob,
    hashTree: hashTree,
    hashCommit: hashCommit,
    hashTag: hashTag
  };

  function test() {
    // Test blob encoding
    var hash = hashBlob(normalizeBlob("Hello World\n"));
    if (hash !== "557db03de997c86a4a028e1ebd3a1ceb225be238") {
      throw new Error("Invalid body hash");
    }

    // Test tree encoding
    hash = hashTree(normalizeTree({ "greeting.txt": { mode: 0100644, hash: hash } }));
    if (hash !== "648fc86e8557bdabbc2c828a19535f833727fa62") {
      throw new Error("Invalid tree hash");
    }

    // Test commit encoding
    hash = hashCommit(normalizeCommit({
      tree: hash,
      author: {
        name: "Tim Caswell",
        email: "tim@creationix.com",
        date: new Date("Fri Jan 17 09:33:29 2014")
      },
      message: "Test Commit\n"
    }));
    if (hash !== "05d04f9b583335a82100e7c5158a6149e4f57d7a") {
      // TODO: make this work with computers in any time zone!
      throw new Error("Invalid commit hash");
    }

    // Test annotated tag encoding
    hash = hashTag(normalizeTag({
      object: hash,
      type: "commit",
      tag: "mytag",
      tagger: {
        name: "Tim Caswell",
        email: "tim@creationix.com",
        date: new Date("Fri Jan 17 09:46:16 2014")
      },
      message: "Tag it!\n"
    }));
    if (hash !== "d2f2d639e67abb8b5c4f8e93722971dc02ad7311") {
      // TODO: make this work with computers in any time zone!
      throw new Error("Invalid annotated tag hash");
    }
  }

  function encodeAs(type, body) {
    if (type === "blob")   return encodeBlob(body);
    if (type === "tree")   return encodeTree(body);
    if (type === "commit") return encodeCommit(body);
    if (type === "tag")    return encodeTag(body);
  }

  function normalizeAs(type, body) {
    if (type === "blob")   return normalizeBlob(body);
    if (type === "tree")   return normalizeTree(body);
    if (type === "commit") return normalizeCommit(body);
    if (type === "tag")    return normalizeTag(body);
  }

  function hashAs(type, body) {
    return sha1(frame(type, encodeAs(type, body)));
  }

  function hashBlob(body) {
    return sha1(frame("blob", encodeBlob(body)));
  }

  function hashTree(body) {
    return sha1(frame("tree", encodeTree(body)));
  }

  function hashCommit(body) {
    return sha1(frame("commit", encodeCommit(body)));
  }

  function hashTag(body) {
    return sha1(frame("tag", encodeTag(body)));
  }

  function frame(type, body) {
    return type + " " + body.length + "\0" + body;
  }

  function normalizeBlob(body) {
    var type = typeof body;
    if (type === "string") {
      return binary.encodeUtf8(body);
    }
    if (body && type === "object") {
      if (body.constructor.name === "ArrayBuffer") body = new Uint8Array(body);
      if (typeof body.length === "number") {
        return binary.toRaw(body);
      }
    }
    throw new TypeError("Blob body must be raw string, ArrayBuffer or byte array");
  }

  function encodeBlob(body) {
    return body;
  }

  function normalizeTree(body) {
    var type = body && typeof body;
    if (type !== "object") {
      throw new TypeError("Tree body must be array or object");
    }
    var tree = {}, i, l, entry;
    // If array form is passed in, convert to object form.
    if (Array.isArray(body)) {
      for (i = 0, l = body.length; i < l; i++) {
        entry = body[i];
        tree[entry.name] = {
          mode: entry.mode,
          hash: entry.hash
        };
      }
    }
    else {
      var names = Object.keys(body);
      for (i = 0, l = names.length; i < l; i++) {
        var name = names[i];
        entry = body[name];
        tree[name] = {
          mode: entry.mode,
          hash: entry.hash
        };
      }
    }
    return tree;
  }

  function encodeTree(body) {
    var tree = "";
    var names = Object.keys(body).sort(pathCmp);
    for (var i = 0, l = names.length; i < l; i++) {
      var name = names[i];
      var entry = body[name];
      tree += entry.mode.toString(8) + " " + name
            + "\0" + binary.decodeHex(entry.hash);
    }
    return tree;
  }

  function normalizeCommit(body) {
    if (!body || typeof body !== "object") {
      throw new TypeError("Commit body must be an object");
    }
    if (!(body.tree && body.author && body.message)) {
      throw new TypeError("Tree, author, and message are required for commits");
    }
    var parents = body.parents || (body.parent ? [ body.parent ] : []);
    if (!Array.isArray(parents)) {
      throw new TypeError("Parents must be an array");
    }
    var author = normalizePerson(body.author);
    var committer = body.committer ? normalizePerson(body.committer) : author;
    return {
      tree: body.tree,
      parents: parents,
      author: author,
      committer: committer,
      message: body.message
    };
  }

  function encodeCommit(body) {
    var str = "tree " + body.tree;
    for (var i = 0, l = body.parents.length; i < l; ++i) {
      str += "\nparent " + body.parents[i];
    }
    str += "\nauthor " + formatPerson(body.author) +
           "\ncommitter " + formatPerson(body.committer) +
           "\n\n" + body.message;
    return binary.encodeUtf8(str);
  }

  function normalizeTag(body) {
    if (!body || typeof body !== "object") {
      throw new TypeError("Tag body must be an object");
    }
    if (!(body.object && body.type && body.tag && body.tagger && body.message)) {
      throw new TypeError("Object, type, tag, tagger, and message required");
    }
    return {
      object: body.object,
      type: body.type,
      tag: body.tag,
      tagger: normalizePerson(body.tagger),
      message: body.message
    };
  }

  function encodeTag(body) {
    var str = "object " + body.object +
      "\ntype " + body.type +
      "\ntag " + body.tag +
      "\ntagger " + formatPerson(body.tagger) +
      "\n\n" + body.message;
    return binary.encodeUtf8(str);
  }

  function pathCmp(a, b) {
    a += "/"; b += "/";
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function normalizePerson(person) {
    if (!person || typeof person !== "object") {
      throw new TypeError("Person must be an object");
    }
    if (!person.name || !person.email) {
      throw new TypeError("Name and email are required for person fields");
    }
    return {
      name: person.name,
      email: person.email,
      date: person.date || new Date()
    };
  }

  function formatPerson(person) {
    return safe(person.name) +
      " <" + safe(person.email) + "> " +
      formatDate(person.date);
  }

  function safe(string) {
    return string.replace(/(?:^[\.,:;<>"']+|[\0\n<>]+|[\.,:;<>"']+$)/gm, "");
  }

  function formatDate(date) {
    var timezone = (date.timeZoneoffset || date.getTimezoneOffset()) / 60;
    var seconds = Math.floor(date.getTime() / 1000);
    return seconds + " " + (timezone > 0 ? "-0" : "0") + timezone + "00";
  }

});