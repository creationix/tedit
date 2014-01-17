/*global define*/
define("encoders", function () {
  var sha1 = require('sha1');
  var binary = require('binary');

  // Run sanity tests at startup.
  test();

  return {
    frame: frame,
    encodeBlob: encodeBlob,
    encodeTree: encodeTree,
    encodeCommit: encodeCommit,
    encodeTag: encodeTag,
    hashBlob: hashBlob,
    hashTree: hashTree,
    hashCommit: hashCommit,
    hashTag: hashTag
  };

  function test() {
    // Test blob encoding
    var hash = hashBlob("Hello World\n");
    if (hash !== "557db03de997c86a4a028e1ebd3a1ceb225be238") {
      throw new Error("Invalid body hash");
    }

    // Test tree encoding
    hash = hashTree({ "greeting.txt": { mode: 0100644, hash: hash } });
    if (hash !== "648fc86e8557bdabbc2c828a19535f833727fa62") {
      throw new Error("Invalid tree hash");
    }

    // Test commit encoding
    hash = hashCommit({
      tree: hash,
      author: {
        name: "Tim Caswell",
        email: "tim@creationix.com",
        date: new Date("Fri Jan 17 09:33:29 2014")
      },
      message: "Test Commit\n"
    });
    if (hash !== "7084d22f1a8c72cd6f8436609ef63486eb0971d6") {
      throw new Error("Invalid commit hash");
    }

    // Test annotated tag encoding
    hash = hashTag({
      object: hash,
      type: "commit",
      tag: "mytag",
      tagger: {
        name: "Tim Caswell",
        email: "tim@creationix.com",
        date: new Date("Fri Jan 17 09:46:16 2014")
      },
      message: "Tag it!\n"
    });
    if (hash !== "da3064c1719c4d40dec4cdb01657d766b3ab9239") {
      throw new Error("Invalid annotated tag encoding");
    }
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

  function encodeBlob(body) {
    var type = body && typeof body;
    if (type === "object" && typeof body.length === "number") {
      return binary.toRaw(body);
    }
    if (type === "string") {
      return binary.encodeUtf8(body);
    }
    throw new TypeError("Blob body must be raw string or byte array");
  }

  function encodeTree(body) {
    var type = body && typeof body;
    var tree = "";
    if (type !== "object") {
      throw new TypeError("Tree body must be array or object");
    }
    // If object form is passed in, convert to array form.
    if (!Array.isArray(body)) {
      body = Object.keys(body).map(function (name) {
        var entry = body[name];
        return {
          name: name,
          mode: entry.mode,
          hash: entry.hash
        };
      });
    }

    body.sort(pathCmp);
    for (var i = 0, l = body.length; i < l; i++) {
      var entry = body[i];
      tree += entry.mode.toString(8) + " " + entry.name
            + "\0" + binary.decodeHex(entry.hash);
    }
    return tree;
  }

  function encodeCommit(body) {
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
    var str = "tree " + body.tree;
    for (var i = 0, l = parents.length; i < l; ++i) {
      str += "\nparent " + parents[i];
    }
    str += "\nauthor " + encodePerson(body.author) +
           "\ncommitter " + encodePerson(body.committer || body.author) +
           "\n\n" + body.message;
    return binary.encodeUtf8(str);
  }

  function encodeTag(body) {
    if (!body || typeof body !== "object") {
      throw new TypeError("Tag body must be an object");
    }
    if (!(body.object && body.type && body.tag && body.tagger && body.message)) {
      throw new TypeError("Object, type, tag, tagger, and message required");
    }
    var str = "object " + body.object +
      "\ntype " + body.type +
      "\ntag " + body.tag +
      "\ntagger " + encodePerson(body.tagger) +
      "\n\n" + body.message;
    return binary.encodeUtf8(str);
  }

  function pathCmp(oa, ob) {
    var a = oa.name;
    var b = ob.name;
    a += "/"; b += "/";
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function encodePerson(person) {
    if (!person || typeof person !== "object") {
      throw new TypeError("Person must be an object");
    }
    if (!person.name || !person.email) {
      throw new TypeError("Name and email are required for person fields");
    }
    return safe(person.name) +
      " <" + safe(person.email) + "> " +
      formatDate(person.date || new Date());
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