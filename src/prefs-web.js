"use strict";

module.exports = { get: get, set: set, save: save, clearSync: clearSync };

function get(name, fallback) {
  var value = localStorage.getItem(name);
  if (!value) return fallback;
  return JSON.parse(value);
}

function set(name, value) {
  localStorage.setItem(name, JSON.stringify(value));
  return value;
}

function save() {
}

function clearSync(names, callback) {
  localStorage.clear();
  callback();
}