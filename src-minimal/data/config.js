var jonParse = require('jon-parse');

var configText = localStorage.getItem("config-file");

if (!configText) {
  configText = "{\n" +
  "  -- Set global theme:\n" +
  "  -- true for light theme, false for dark\n" +
  "  lightTheme: true\n" +
  "}\n";
}

var config = jonParse(configText);

var listeners = [];

module.exports = {
  get: getSource,
  set: setSource,
  on: addListener,
  off: removeListener,
};

function getSource() {
  return configText;
}

function setSource(text) {
  if (text === configText) return;
  var data = jonParse(text);
  if (data.constructor !== Object.prototype) {
    throw new Error("Config file must export an object");
  }
  config = data;
  localStorage.setItem("config-file", text);
  configText = text;
  listeners.forEach(notify);
}

function notify(fn) {
  fn(config);
}

function addListener(fn) {
  listeners.push(fn);
  fn(config);
}

function removeListener(fn) {
  listeners.splice(listeners.indexOf(fn));
}