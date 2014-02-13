"use strict";
/*global chrome*/

var defer = require('js-git/lib/defer');
var storage = chrome.storage.local;
var prefs;
var dirty = false;
var saving = false;
module.exports = { init: init, get: get, set: set, save: save, clearSync: clearSync };

function init(callback) {
  storage.get("prefs", function (items) {
    prefs = items.prefs || {};
    // This is deferred to workaround chrome error reporting issues.
    defer(callback);
  });
}

function get(name, fallback) {
  if (name in prefs) return prefs[name];
  prefs[name] = fallback;
  return fallback;
}

function set(name, value) {
  // console.log(name, value);
  if (typeof value !== "object" && prefs[name] === value) return;
  prefs[name] = value;
  save();
  return value;
}

function save() {
  if (!saving) {
    saving = true;
    storage.set({prefs:prefs}, onSave);
  }
  else dirty = true;
}

function onSave() {
  saving = false;
  if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
  if (!dirty) return;
  dirty = false;
  saving = true;
  storage.set({prefs:prefs}, onSave);
}

function clearSync(names, callback) {
  names.forEach(function (name) {
    console.warn("Clearing", name);
    delete prefs[name];
  });
  storage.set({prefs:prefs}, callback);
}
