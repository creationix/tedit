"use strict";
/*global chrome, indexedDB*/
indexedDB.deleteDatabase("tedit");
console.warn("tedit IDB deleted");
chrome.storage.local.clear();
console.warn("chrome local storage cleared");
