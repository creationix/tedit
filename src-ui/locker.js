var modes = require('js-git/lib/modes');

module.exports = function (repo, rootHash, onRootChange) {
  var writing = false;
  var writeLocks = {};
  var readLocks = {};
  var queue = [];

  return begin;

  function* begin(prefix, writable) {
    // Check and normalize inputs
    if (typeof prefix !== "string") {
      throw new TypeError("prefix must be string");
    }
    prefix = normalizePath(prefix);
    prefix = prefix ? prefix + "/" : prefix;
    writable = !!writable;

    // Wait for lock acquisition
    var lock = yield* getLock(prefix, writable);

    var alive = true;
    var edits = {};
    var cache = {};

    // Read the current state of the prefix
    var entry = yield repo.pathToEntry(rootHash, prefix);
    if (entry.mode !== modes.tree) {
      throw new Error("No such tree " + prefix);
    }
    entry.repo = repo;
    cache[""] = entry;

    // Build and return the external API
    var api = {end: end, read: read, getRepo: getRepo};
    if (writable) api.write = write;
    return api;

    function* pathToEntry(path) {
      console.log("p2e", path)
      var entry = cache[path];
      if (!entry) {
        var index = path.lastIndexOf("/");
        if (index < 0) return;
        var parent = yield* pathToEntry(path.substring(0, index));
        if (parent.mode !== modes.tree) return;
        var tree = entry.tree || (yield repo.loadAs("tree", parent.hash));
        entry = tree[path.substring(index + 1)];
        if (!entry) return {last: parent};
        cache[path] = entry;
        if (!entry.repo) entry.repo = repo;
      }
      if (entry.mode === modes.tree && !entry.tree) {
        entry.tree = yield entry.repo.loadAs("tree", entry.hash);
      }
      return entry;
    }

    // The user calls this when they wish to end the transaction and release the lock.
    function* end() {
      if (!alive) throw new Error("Transaction closed");
      alive = false;
      throw new Error("TODO: flush writes");
      yield* releaseLock(lock);
    }

    function* read(path) {
      path = check(path);
      var entry = yield* pathToEntry(path);
      if (entry.mode) return entry;
    }

    function* getRepo(path) {
      path = check(path);
      var entry = yield* pathToEntry(path);
      if (entry.last) entry = entry.last;
      return entry.repo;
    }

    function* write(path, entry) {
      path = check(path);
      var oldEntry = yield* pathToEntry(path);
      if (!oldEntry.mode && oldEntry.last.mode !== modes.tree) {
        throw new Error("Can't create path " + path);
      }
      edits[path] = entry;

      throw new Error("TODO: Implement write");
    }

    function check(path) {
      if (!alive) throw new Error("Transaction closed");
      path = normalizePath(path);
      if (path + "/" !== prefix && path.substring(0, prefix.length) !== prefix) {
        throw new Error("Path " + path + " outside prefix " + prefix);
      }
      return path.substring(prefix.length);
    }
  }

  function* getLock(prefix, writable) {
    return {
      prefix: prefix,
      writable: writable
    };
    return yield function (fn) {
      queue.push({prefix: prefix, writable: writable, fn: fn});
    };
  }

  function* releaseLock(lock) {
    // throw new Error("TODO: release lock");
  }

};


function normalizePath(path) {
  return path.split("/").filter(Boolean).join("/");
}

/*
// Get a writable lock to the www folder and it's contents
// No other writable locks will be granted for this section.
var op = yield* fs.startWrite("www");
op.writeFile("www/index.html", "...");
op.writeFile("www/style.html", "...");
// Reading is also allowed from a read lock
yield* op.readEntry(".gitmodules");
// You can even read yet-to-be-written changes
yield* op.readFile("www/style.html");
// Close the lock, returns the new tree hash for the requested root.
yield* op.close();

// Get a readable lock, there can be many concurrent reads, but only one
// concurrent write.
var op = yield* fs.startRead("www/css");
// Read the tree entries
yield* op.readTree("www/css");
// Release the lock when you're done so writes can happen.
yield* op.close();

// // Read ops
// yield* op.readEntry(path)
// yield* op.readFile(path)
// yield* op.readTree(path)
// // Write ops
// op.writeEntry(path, entry)
// op.writeFile(path, contents)
// op.deleteEntry(path)
// op.moveEntry(oldPath, newPath)
// // close flushing any writes and releasing lock
// yield* op.close()
*/
