"use strict";
/*global chrome*/

var socket = chrome.socket;
var fail = require('../ui/fail.js');

return function startServer(repo, config, node) {
  console.log({
    repo: repo, config: config,
    node: node
  });
  var socketInfo;

  socket.create("tcp", {}, function(info) {
    socketInfo = info;
    socket.listen(socketInfo.socketId, "127.0.0.1", 8080, 20, function(result) {
      // Accept the first response
      socket.accept(socketInfo.socketId, onAccept);
    });
  });

  window.open("http://localhost:8080/");

  function onAccept(acceptInfo) {
    // This is a request that the system is processing.
    // Read the data.

    socket.read(acceptInfo.socketId, function(readInfo) {
      // Parse the request.
      fail(node.$, new Error("TODO: Implement http request parser"));
      console.log(readInfo);
    });
  }

};
