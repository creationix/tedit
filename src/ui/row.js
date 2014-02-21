"use strict";
// This module handles rendering for rows in the file tree
// It exports an object with data-bound properties that control the UI

var domBuilder = require('dombuilder');
var modes = require('js-git/lib/modes');

module.exports = makeRow;

// This represents trees, commits, files, and symlinks.
// Any of it's properties can be read or written and auto-updates the UI
function makeRow(path, mode, hash, parent) {
  if (typeof path !== "string") throw new TypeError("path must be a string");
  if (typeof mode !== "number") throw new TypeError("mode must be a number");
  var errorMessage = "",
      title,
      treeHash,
      pulse,
      exportPath,
      serverPort,
      open = false,
      busy = 0,
      active = false,
      selected = false,
      dirty = false,
      staged = false;
  var $ = {};
  var children;
  var row = {
    el: domBuilder(["li$el", ["$row", ["i$icon"], ["span$span"]]], $),
    get title () { return title; },
    set title( value) {
      title = value;
      updatePath();
    },
    get pulse () { return pulse; },
    set pulse( value) {
      pulse = value;
      updateIcon();
    },
    get exportPath () { return exportPath; },
    set exportPath( value) {
      exportPath = value;
      updateIcon();
    },
    get serverPort () { return serverPort; },
    set serverPort( value) {
      serverPort = value;
      updateIcon();
    },
    get path() { return path; },
    set path(newPath) {
      path = newPath;
      updatePath();
    },
    get mode() { return mode; },
    set mode(value) {
      mode = value;
      updateIcon();
      updateUl();
    },
    get open() { return open; },
    set open(value) {
      open = value;
      updateIcon();
    },
    get busy() { return busy; },
    set busy(isBusy) {
      busy = isBusy;
      updateIcon();
    },
    get active() { return active; },
    set active(value) {
      active = value;
      updateRow();
    },
    get selected() { return selected; },
    set selected(value) {
      selected = value;
      updateRow();
    },
    get dirty() { return dirty; },
    set dirty(value) {
      dirty = value;
      updateRow();
    },
    get staged() { return staged; },
    set staged(value) {
      staged = value;
      updateRow();
    },
    get hash() { return hash; },
    set hash(value) {
      hash = value;
      updateIcon();
    },
    get treeHash() { return treeHash; },
    set treeHash(value) {
      treeHash = value;
      updateIcon();
    },
    get errorMessage() { return errorMessage; },
    set errorMessage(value) {
      errorMessage = value;
      updateIcon();
    },
    addChild: addChild,
    removeChild: removeChild,
    removeChildren: removeChildren,
    // return next row in list
    get next() {
      return parent && parent.before(row);
    },
    // return previous row in list
    get prev() {
      return parent && parent.after(row);
    },
    // return last child
    get last() {
      return children && children.length && children[children.length - 1];
    },
    // return first child
    get first() {
      return children && children.length && children[0];
    },
    // Get row after specefied child
    after: after,
    // Get row before specefied child
    before: before,
    // Boilerplate helper to automate fs calls for a row
    call: call,
  };
  $.el.js = row;
  updateAll();
  return row;

  function updateIcon() {
    var value =
      (errorMessage ? "icon-attention" :
      busy ? "icon-spin1 animate-spin" :
      mode === modes.sym ? "icon-link" :
      mode === modes.file ? "icon-doc" :
      mode === modes.exec ? "icon-cog" :
      mode === modes.commit ? "icon-fork" :
      open ? "icon-folder-open" : "icon-folder") +
        (mode === modes.commit ? " tight" : "");
    $.icon.setAttribute("class", value);
    var title = modes.toType(mode) + " " + hash;
    if (errorMessage) title += "\n" + errorMessage;
    $.icon.setAttribute("title", title);
    if (mode !== modes.commit) {
      if ($.folder) {
        $.row.removeChild($.folder);
        delete $.folder;
      }
    }
    else {
      if (!$.folder) {
        $.row.insertBefore(domBuilder(["i$folder"], $), $.icon);
      }
      $.folder.setAttribute("class", "icon-folder" + (open ? "-open" : ""));
      $.folder.setAttribute("title", "tree " + treeHash);
    }
    if (serverPort) {
      if (!$.server) {
        $.row.appendChild(domBuilder(["i$server"], $));
        $.export.setAttribute("class", "icon-globe" + (pulse ? " animate-spin" : ""));
      }
      $.server.setAttribute("title", "Serving on port " + serverPort);
    }
    else if ($.server) {
      $.row.removeChild($.server);
      delete $.server;
    }
    if (exportPath) {
      if (!$.export) {
        $.row.appendChild(domBuilder(["i$export"], $));
      }
      $.export.setAttribute("title", "Live Exporting to " + exportPath);
      $.export.setAttribute("class", "icon-floppy" + (pulse ? " animate-spin" : ""));
    }
    else if ($.export) {
      $.row.removeChild($.export);
      delete $.export;
    }
  }

  function updatePath() {
    // Update the UI to show the short-name
    var name = path.substring(path.lastIndexOf("/") + 1);
    $.span.textContent = name || "Tedit WorkSpace";
    $.span.setAttribute("title", title || "");
  }

  function updateRow() {
    var classes = ["row"];
    if (dirty) classes.push("dirty");
    if (staged) classes.push("staged");
    if (active) classes.push("active");
    if (selected) classes.push("selected");
    $.row.setAttribute("class", classes.join(" "));
  }

  function updateUl() {
    if (modes.isBlob(mode)) {
      if ($.ul) {
        $.el.removeChild($.ul);
        delete $.ul;
        children = null;
      }
    }
    else if (!$.ul) {
      $.el.appendChild(domBuilder(["ul$ul"], $));
      children = [];
    }
  }

  function updateAll() {
    updateIcon();
    updatePath();
    updateRow();
    updateUl();
  }

  function addChild(child) {
    if (!$.ul) throw new Error("Not Container");
    var other;
    // Sort children by path
    for (var i = 0, l = children.length; i < l; i++) {
      other = children[i];
      if (other.path > child.path) break;
    }
    if (i === l) {
      $.ul.appendChild(child.el);
      children.push(child);
    }
    else {
      $.ul.insertBefore(child.el, children[i].el);
      children.splice(i, 0, child);
    }
    return child;
  }

  function removeChild(child) {
    if (!$.ul) throw new Error("Not Container");
    var index = children.indexOf(child);
    if (index < 0) throw new Error("Child not found");
    children.splice(index, 1);
    $.ul.removeChild(child.el);
    return child;
  }

  function removeChildren() {
    if (!children) return;
    children.length = 0;
    while ($.ul.firstChild) $.ul.removeChild($.ul.firstChild);
  }

  function after(child) {
    var index = children.indexOf(child);
    if (index < children.length - 1) {
      return children[index + 1];
    }
    throw "TODO: Implement after jump";
  }

  function before(child) {
    var index = children.indexOf(child);
    if (index > 1) return children[index - 1];
    throw "TODO: Implement before jump";
  }

  // First arg is function to call.
  // row path is injected as first argument in function
  // If first arg is a string, it's used at the path instead.
  // callback is intercepted with error stripping/checking callback
  // callback gets rest of original callback args.
  function call(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    // Strip original callback from end if it's there.
    var cb = (typeof args[args.length - 1] === "function") && args.pop();
    // Prepend path at front of args
    if (typeof fn !== "function") {
      var newPath = fn;
      fn = args[0];
      args[0] = newPath;
    }
    else {
      args.unshift(path);
    }
    // console.log(path, "+", arguments);
    // Append new callback at end
    args.push(callback);
    // Mark the row as busy and run the async action with error catching
    row.busy++;
    try { fn.apply(null, args); }
    catch (err) { fail(err); }

    function callback(err) {
      // Mark the async action as done
      // console.log(path, "-", arguments);
      row.busy--;
      // If there was an async error, report it
      if (err) fail(err);
      if (!cb) return;
      // Otherwise call the original callback with the rest of the args.
      var args = Array.prototype.slice.call(arguments, 1);
      try { cb.apply(null, args); }
      catch (err) { fail(err); }
    }
  }

  function fail(err) {
    row.errorMessage = err.toString();
    throw err;
  }
}
