"use strict";

var notify = require('./notify');
var prefs = require('./prefs');
var zooms = [
  25, 33, 50, 67, 75, 90, 100, 110, 120, 125, 150, 175, 200, 250, 300, 400, 500
];
var zoomIndex = prefs.get("zoomIndex", zooms.indexOf(100));
var oldIndex = zoomIndex;

var handlers = [];

onZoom.bigger = bigger;
onZoom.smaller = smaller;
onZoom.reset = reset;
module.exports = onZoom;

function bigger() {
  if (zoomIndex < zooms.length - 1) zoomIndex++;
  zoom();
}

function smaller() {
  if (zoomIndex > 0) zoomIndex--;
  zoom();
}

function reset() {
  zoomIndex = zooms.indexOf(100);
  zoom();
}

function onZoom(callback) {
  handlers.push(callback);
  callback(zooms[zoomIndex] / 100, zooms[oldIndex] / 100);
}

function zoom() {
  if (zoomIndex === oldIndex) return;
  var percent = zooms[zoomIndex];
  var scale = percent / 100;
  var oldScale = oldIndex && zooms[oldIndex] / 100;
  oldIndex = zoomIndex;
  handlers.forEach(function (handler) {
    handler(scale, oldScale);
  });
  prefs.set("zoomIndex", zoomIndex);
  notify(percent + "% zoom");
}
