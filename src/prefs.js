/*global define, chrome*/
define("prefs", function () {
  var defer = require('defer');
  var storage = chrome.storage.local;
  var prefs;
  var dirty = false;
  var saving = false;
  return { init: init, get: get, set: set };

  function init(callback) {
    storage.get("prefs", function (items) {
      prefs = items.prefs || {};
      // console.log(prefs);
      defer(callback);
    });
  }

  function get(name, fallback) {
    if (name in prefs) return prefs[name];
    return fallback;
  }

  function set(name, value) {
    // console.log(name, value);
    if (typeof value !== "object" && prefs[name] === value) return;
    prefs[name] = value;
    if (!saving) {
      saving = true;
      storage.set({prefs:prefs}, onSave);
    }
    else dirty = true;
  }

  function onSave() {
    saving = false;
    if (!dirty) return;
    dirty = false;
    saving = true;
    storage.set({prefs:prefs}, onSave);
  }

});