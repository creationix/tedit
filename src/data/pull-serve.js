
var readPath = require('./fs').readPath;
var publisher = require('data/publisher');
var notify = require('ui/notify');
var codec = require('http-codec').server;
var socket = window.chrome.socket;
var binary = require('bodec');
var getMime = require('simple-mime')("text/plain");
var pathJoin = require('pathjoin');

module.exports = addServeHook;

function addServeHook(row, settings) {
  var serverId, rootHash;
  var servePath = publisher(readPath, settings);

  socket.create("tcp", {}, onCreate);
  row.call(readPath, onEntry);

  return hook;

  function onCreate(socketInfo) {
    serverId = socketInfo.socketId;
    var ip = settings.public ? "0.0.0.0" : "127.0.0.1";
    socket.listen(serverId, ip, settings.port, onListen);
  }

  // TODO: add proper error checking all over this file

  function onListen(result) {
    // Look up the local port to show the user
    socket.getInfo(serverId, function (info) {
      // Show the user a globe icon with port information.
      var address = info.localAddress === "0.0.0.0" ? "localhost" : info.localAddress;
      notify("Local Server at http://" + address + ":" + info.localPort + "/");
      row.serverPort = info.localPort;
    });
    start();
  }

  function start() {
    socket.accept(serverId, onAccept);
  }

  function onAccept(acceptInfo) {

    var clientId = acceptInfo.socketId;
    var decode = codec.decoder(onItem);
    var encode = codec.encoder(onOut);

    socket.getInfo(clientId, function (info) {
      notify("TCP connection from " + info.peerAddress + ":" + info.peerPort);
      read();
    });

    // Start listening for the next request
    start();

    function read() {
      socket.read(clientId, onRead);
    }

    function onRead(readInfo) {
      decode(new Uint8Array(readInfo.data));
      // if (readInfo.resultCode) read();
      read();
    }

    function onOut(binary) {
      if (binary) {
        socket.write(clientId, binary.buffer, function (writeInfo) { });
      }
      else {
        socket.disconnect(clientId);
      }
    }

    function onItem(item) {
      if (!item.method) return; // TODO: handle request bodies

      // Ensure the request is either HEAD or GET by rejecting everything else
      var head = item.method === "HEAD";
      if (!head && item.method !== "GET") {
        return respond(405, [
          ["Allow", "HEAD,GET"]
        ], "");
      }

      // Normalize the path to work with publisher system
      var path = pathJoin(settings.source, item.path);

      // Put headers in lowercased object for quick access
      var headers = {};
      item.headers.forEach(function (pair) {
        headers[pair[0].toLowerCase()] = pair[1];
      });

      var etag = headers['if-none-match'];
      serve(path, etag);

      function serve() {
        row.pulse++;
        servePath(path, etag, function (err, result) {
          row.pulse--;
          try { onServe(err, result); }
          catch (err) { row.fail(err); }
        });
      }

      function onServe(err, result) {

        if (err) {
          respond(500, [], err.stack);
          row.fail(err);
        }

        if (!result) {
          return respond(404, [], item.path + " not found");
        }

        if (result.etag && result.etag === etag) {
          // etag matches, no change
          return respond(304, [
            ["Etag", result.etag]
          ], "");
        }

        if (result.tree) {
          // Tell the browser to redirect if they forgot the trailing slash on a tree.
          if (item.path[item.path.length - 1] !== "/") {
            return respond(301, [
              ["Location", item.path + "/"]
            ], "");
          }
          // Do an internal redirect if an index.html exists
          if (result.tree["index.html"]) {
            path += "/index.html";
            return serve();
          }
          return respond(200, [
            ["Content-Type", "application/json"]
          ], JSON.stringify(result.tree) + "\n");
        }

        result.fetch(function (err, body) {
          if (err) {
            respond(500, [], err.stack);
            row.fail(err);
          }
          var resHeaders = [
            ["Etag", result.etag],
            ["Content-Type", result.mime || getMime(path)]
          ];
          respond(200, resHeaders, body);
        });
      }

      function respond(code, headers, body) {
        // Log the request
        notify(item.method + " " + item.path + " " + code);

        if (typeof body === "string") body = binary.fromUnicode(body);
        var contentType, contentLength;
        headers.forEach(function (pair) {
          var key = pair[0].toLowerCase();
          if (key === "content-type") contentType = pair[1];
          else if (key === "content-length") contentLength = pair[1];
        });
        if (!contentType) headers.push(["Content-Type", "text/plain"]);
        if (!contentLength) headers.push(["Content-Length", body.length]);
        encode({
          code: code,
          headers: headers
        });
        encode(body);
        encode();
      }
    }
  }

  function onEntry(entry) {
    hook(entry.hash);
  }

  function hook(newHash) {
    if (newHash === rootHash) return;
    rootHash = newHash;
    if (!serverId) return;
    // TODO: maybe invalidate some caches if needed?
  }

}
