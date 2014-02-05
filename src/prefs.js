/*global define, chrome*/
define("prefs", function () {
  var defer = require('defer');
  var storage = chrome.storage.local;
  var prefs;
  var dirty = false;
  var saving = false;
  return { init: init, get: get, set: set, save: save };

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
    if (!dirty) return;
    dirty = false;
    saving = true;
    storage.set({prefs:prefs}, onSave);
  }

});