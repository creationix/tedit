"use strict";

module.exports = { get: get, set: set, save: save, clearSync: clearSync };

function get(name, fallback) {
  var value = localStorage.getItem(name);
  if (!value) return fallback;
  try {
    value = JSON.parse(value);
  }
  catch (err) {
    console.warn(err.stack);
    value = fallback;
  }
  return value;
}

function set(name, value) {
  if (value === undefined) localStorage.removeItem(name);
  else localStorage.setItem(name, JSON.stringify(value));
  return value;
}

function save() {
}

function clearSync(names, callback) {
  localStorage.clear();
  callback();
}