"use strict";
var editHook = require('./edit-hook');
var dialog = require('ui/dialog');
var readPath = require('data/fs').readPath;
var publisher = require('data/publisher');
var notify = require('ui/notify');
var codec = require('http-codec').server;
var bodec = require('bodec');
var getMime = require('simple-mime')("text/plain");
var pathJoin = require('pathjoin');
var modes = require('js-git/lib/modes');

var remote = require('remote');
var net = remote.require('net');

exports.menuItem = {
  icon: "globe",
  label: "Serve Over HTTP",
  action: pullServe
};

function pullServe(row) {
  editHook(row, serveConfigDialog, addServeHook);
}

function nullify(evt) {
  if (!evt) return;
  evt.stopPropagation();
  evt.preventDefault();
}

function serveConfigDialog(config, callback) {
  var $ = dialog("Serve Config", [
    ["form", {onsubmit: submit},
      ["label", {"for": "port"}, "Local HTTP Port"],
      [".input",
        ["input.input-field$port", {
          name: "port",
          value: config.port,
          required: true
        }],
        ["input.input-item$public", {
          type: "checkbox",
          name: "public",
          checked: !!config.public,
          title: "Make this available to others on your local network?"
        }],
      ],
      ["label", {"for": "source"}, "Source Path"],
      [".input",
        ["input.input-field$source", {
          name: "source",
          value: config.source,
          required: true
        }],
      ],
      ["label", {"for": "filters"}, "Filters Path"],
      [".input",
        ["input.input-field$filters", {
          name: "filters",
          value: config.filters,
        }],
        ["input.input-item$submit", {type:"submit",value:"OK"}]
      ]
    ]
  ], onCancel);

  function onCancel(evt) {
    nullify(evt);
    $.close();
    callback();
  }

  function submit(evt) {
    nullify(evt);

    config.port = parseInt($.port.value, 10);
    config.source = $.source.value;
    config.public = $.public.checked;
    config.filters = $.filters.value;
    $.close();
    callback(config);
  }

}


function addServeHook(row, settings) {
  var rootHash;
  var servePath = publisher(readPath, settings);

  var server = net.createServer(onConnection);
  var ip = settings.public ? "0.0.0.0" : "127.0.0.1";
  server.listen(settings.port, ip, onListen);

  return hook;

  // TODO: add proper error checking all over this file

  function onListen() {

    // Look up the local port to show the user
    var info = server.address();
    var address = info.address === "0.0.0.0" ? "localhost" : info.address;
    notify("Local Server at http://" + address + ":" + info.port + "/");
    row.serverPort = info.port;
  }

  function onConnection(client) {

    var decode = codec.decoder(onItem);
    var encode = codec.encoder(onOut);

    notify("TCP connection from " + client.remoteAddress + ":" + client.remotePort);
    client.on("data", onData);

    function onData(data) {
      decode(new Uint8Array(data));
    }

    function onOut(data) {
      if (data) {
        var raw = bodec.toRaw(data);
        client.write(raw, "binary");
      }
      else {
        client.end();
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

      var pathname = item.path.split("?")[0];

      // Normalize the path to work with publisher system
      var path = pathJoin(settings.source, pathname);

      // Put headers in lowercased object for quick access
      var headers = {};
      item.headers.forEach(function (pair) {
        headers[pair[0].toLowerCase()] = pair[1];
      });

      var etag = headers['if-none-match'];
      serve();

      function serve() {
        row.pulse++;
        servePath(path, function (err, result) {
          row.pulse--;
          try { onServe(err, result); }
          catch (err) { row.fail(err); }
        });
      }

      function onServe(err, result) {

        if (err) return error(err);

        if (!(result && result.hash)) {
          return respond(404, [], pathname + " not found");
        }

        if (result.hash && result.hash === etag) {
          // etag matches, no change
          return respond(304, [
            ["Etag", result.hash]
          ], "");
        }

        if (result.mode === modes.tree) {
          // Tell the browser to redirect if they forgot the trailing slash on a tree.
          if (pathname[pathname.length - 1] !== "/") {
            return respond(301, [
              ["Location", pathname + "/"]
            ], "");
          }
          return result.fetch(function (err, tree) {
            if (err) return error(err);
            // Do an internal redirect if an index.html exists
            if (tree["index.html"]) {
              path += "/index.html";
              return serve();
            }
            var accept = headers.accept;
            if (/text\/html/.test(accept)) {
              return respond(200, [
                ["Etag", result.hash],
                ["Content-Type", "text/html; charset=utf-8"]
              ], formatTree(tree) + "\n");
            }
            // Otherwise send the raw JSON
            return respond(200, [
              ["Etag", result.hash],
              ["Content-Type", "application/json; charset=utf-8"]
            ], JSON.stringify(tree) + "\n");
          });
        }

        result.fetch(function (err, body) {
          if (err) return error(err);
          var resHeaders = [
            ["Etag", result.hash],
            ["Content-Type", result.mime || getMime(path)]
          ];
          body = new Uint8Array(body);
          respond(200, resHeaders, body);
        });
      }

      function error(err) {
        respond(500, [], err.stack);
        row.fail(err);
      }


      function respond(code, headers, body) {
        // Log the request
        notify(item.method + " " + pathname + " " + code);

        if (typeof body === "string") body = bodec.fromUnicode(body);
        var contentType, contentLength;
        headers.forEach(function (pair) {
          var key = pair[0].toLowerCase();
          if (key === "content-type") contentType = pair[1];
          else if (key === "content-length") contentLength = pair[1];
        });
        if (typeof body === "string") {
          body = bodec.fromUnicode(body);
        }
        if (!contentType) headers.push(["Content-Type", "text/plain; charset=utf-8"]);
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

  function hook(newHash) {
    if (newHash === rootHash) return;
    rootHash = newHash;
    if (server) return;
    // TODO: maybe invalidate some caches if needed?
  }

}

function formatTree(tree) {
  return "<ul>\n  " + Object.keys(tree).map(function (name) {
    var escaped = name.replace(/&/g, '&amp;')
                      .replace(/"/g, '&quot;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;');
    var entry = tree[name];
    return '<li><a href="' + escaped + '">' + escaped + "</a>" +
                " - " + entry.mode.toString(8) +
                " - " + entry.hash + "</li>";
  }).join("\n  ") + "\n</ul>";
}

function noop() {}
