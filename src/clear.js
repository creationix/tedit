/*global define, chrome, indexedDB*/
define("clear", function () {
  "use strict";
  indexedDB.deleteDatabase("tedit");
  console.log("tedit IDB deleted");
  chrome.storage.local.clear();
  console.log("chrome local storage cleared");
});