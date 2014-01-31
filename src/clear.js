/*global define, chrome, indexedDB*/
define("clear", function () {
  "use strict";
  indexedDB.deleteDatabase("tedit");
  console.warn("tedit IDB deleted");
  chrome.storage.local.clear();
  console.warn("chrome local storage cleared");
});