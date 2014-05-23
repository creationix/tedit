"use strict";

var json = localStorage.getItem("prefs");
var prefs;
try {
  prefs = json && JSON.parse(json);
}
catch (err) {
}
prefs = prefs || {};

module.exports = { get: get, set: set, save: save, clearSync: clearSync };

function get(name, fallback) {
  return prefs[name] || (prefs[name] = fallback);
}

function set(name, value) {
  prefs[name] = value;
  save();
  return value;
}

function save() {
  localStorage.setItem("prefs", JSON.stringify(prefs));
}

function clearSync(names, callback) {
  localStorage.clear();
  callback();
}