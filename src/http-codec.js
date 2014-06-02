define("http-codec.js", ["bodec.js"], function (module, exports) { var binary = require('bodec.js');
var HTTP1_1 = binary.fromUnicode("HTTP/1.1");
module.exports = {
  server: {
    encoder: serverEncoder,
    decoder: serverDecoder,
  },
  client: {
    encoder: clientEncoder,
    decoder: clientDecoder,
  },
};

function serverEncoder(write) {
  return function (res) {
    if (res === undefined) return write(undefined);
    if (binary.isBinary(res)) return write(res);
    var head = "HTTP/1.1 " + res.code + " " + STATUS_CODES[res.code] + "\r\n";
    res.headers.forEach(function (pair) {
      head += pair[0] + ": " + pair[1] + "\r\n";
    });
    head += "\r\n";
    write(binary.fromUnicode(head));
  };
}

function clientEncoder(write) {
  return function (req) {
    if (req === undefined) return write(undefined);
    if (binary.isBinary(req)) return write(req);
    var head = req.method + " " + req.path + " HTTP/1.1\r\n";
    req.headers.forEach(function (pair) {
      head += pair[0] + ": " + pair[1] + "\r\n";
    });
    head += "\r\n";
    write(binary.fromUnicode(head));
  };
}

function clientDecoder(emit) {
  return parser(true, emit);
}

function serverDecoder(emit) {
  return parser(false, emit);
}

function parser(client, emit) {
  var position = 0, code = 0;
  var key = "", value = "";
  var chunked = false, length;
  var headers = [];
  var method = "", path = "";
  var $start = client ? $version : $server;
  var state = $start;
  return function (chunk) {
    if (chunk === undefined) return emit();
    if (!state) return emit(chunk);
    var i = 0, length = chunk.length;
    while (i < length) {
      state = state(chunk[i++]);
      if (state) continue;
      emit(binary.slice(chunk, i));
      break;
    }
  };

  function $version(byte) {
    if (byte === HTTP1_1[position++]) return $version;
    if (position === 9) {
      if (client && byte === 0x20) return $code;
      if (!client && byte === 0x0d) return $newline;
    }
    throw new SyntaxError("Must be HTTP/1.1");
  }

  function $code(byte) {
    if (byte === 0x20) return $message;
    if (position++ < 3) {
      code = (code * 10) + byte - 0x30;
      position = 0;
      return $code;
    }
    throw new SyntaxError("Invalid status code");
  }

  function $message(byte) {
    if (byte === 0x0d) {
      position = 0;
      return $newline;
    }
    return $message;
  }

  function $server(byte) {
    if (byte > 0x40 && byte <= 0x5a) { // Capital letter for method
      method += String.fromCharCode(byte);
      return $server;
    }
    if (!method) throw new SyntaxError("Missing HTTP method");
    if (byte === 0x20) return $url;
    throw new SyntaxError("Invalid HTTP method");
  }

  function $url(byte) {
    if (byte !== 0x20) {
      path += String.fromCharCode(byte);
      return $url;
    }
    return $version;
  }

  function $newline(byte) {
    if (byte === 0x0a) return $end;
    throw new SyntaxError("Invalid line ending");
  }

  function $end(byte) {
    if (byte === 0x0d) return $ending;
    return $key(byte);
  }

  function $key(byte) {
    if (byte === 0x3a) return $sep;
    key += String.fromCharCode(byte);
    return $key;
  }

  function $sep(byte) {
    if (byte === 0x20) return $sep;
    return $value(byte);
  }

  function $value(byte) {
    if (byte === 0x0d) {
      var lower = key.toLowerCase();
      if (lower === "transfer-encoding" && value === "chunked") {
        chunked = true;
      }
      else if (lower === "content-length") length = parseInt(value, 10);
      headers.push([key, value]);
      key = "";
      value = "";
      return $newline;
    }
    value += String.fromCharCode(byte);
    return $value;
  }

  function $ending(byte) {
    if (byte === 0x0a) {
      if (client) {
        emit({
          code: code,
          headers: headers
        });
        code = 0;
      }
      else {
        emit({
          method: method,
          path: path,
          headers: headers
        });
        method = "";
        path = "";
      }
      headers = [];
      if (chunked) return chunkMachine(emit, $start);
      return null;
    }
    throw new SyntaxError("Invalid header ending");
  }

}

function chunkMachine(emit, $start) {
  var position = 0, size = 0;
  var chunk = null;
  return $len;
  function $len(byte) {
    if (byte === 0x0d) return $chunkStart;
    size <<= 4;
    if (byte >= 0x30 && byte < 0x40) size += byte - 0x30;
    else if (byte > 0x60 && byte <= 0x66) size += byte - 0x57;
    else if (byte > 0x40 && byte <= 0x46) size += byte - 0x37;
    else throw new SyntaxError("Invalid chunked encoding length header");
    return $len;
  }

  function $chunkStart(byte) {
    if (byte === 0x0a) {
      if (size) {
        chunk = binary.create(size);
        return $chunk;
      }
      return $ending;
    }
    throw new SyntaxError("Invalid chunk ending");
  }

  function $chunk(byte) {
    chunk[position++] = byte;
    if (position < size) return $chunk;
    return $ending;
  }

  function $ending(byte) {
    if (byte !== 0x0d) throw new SyntaxError("Problem in chunked encoding");
    return $end;

  }

  function $end(byte) {
    if (byte !== 0x0a) throw new SyntaxError("Problem in chunked encoding");
    var next;
    if (size) {
      emit(chunk);
      next = $len;
    }
    else {
      emit();
      next = $start;
    }
    chunk = null;
    size = 0;
    position = 0;
    return next;
  }

}

var STATUS_CODES = {
  '100': 'Continue',
  '101': 'Switching Protocols',
  '102': 'Processing',                 // RFC 2518, obsoleted by RFC 4918
  '200': 'OK',
  '201': 'Created',
  '202': 'Accepted',
  '203': 'Non-Authoritative Information',
  '204': 'No Content',
  '205': 'Reset Content',
  '206': 'Partial Content',
  '207': 'Multi-Status',               // RFC 4918
  '300': 'Multiple Choices',
  '301': 'Moved Permanently',
  '302': 'Moved Temporarily',
  '303': 'See Other',
  '304': 'Not Modified',
  '305': 'Use Proxy',
  '307': 'Temporary Redirect',
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '402': 'Payment Required',
  '403': 'Forbidden',
  '404': 'Not Found',
  '405': 'Method Not Allowed',
  '406': 'Not Acceptable',
  '407': 'Proxy Authentication Required',
  '408': 'Request Time-out',
  '409': 'Conflict',
  '410': 'Gone',
  '411': 'Length Required',
  '412': 'Precondition Failed',
  '413': 'Request Entity Too Large',
  '414': 'Request-URI Too Large',
  '415': 'Unsupported Media Type',
  '416': 'Requested Range Not Satisfiable',
  '417': 'Expectation Failed',
  '418': 'I\'m a teapot',              // RFC 2324
  '422': 'Unprocessable Entity',       // RFC 4918
  '423': 'Locked',                     // RFC 4918
  '424': 'Failed Dependency',          // RFC 4918
  '425': 'Unordered Collection',       // RFC 4918
  '426': 'Upgrade Required',           // RFC 2817
  '500': 'Internal Server Error',
  '501': 'Not Implemented',
  '502': 'Bad Gateway',
  '503': 'Service Unavailable',
  '504': 'Gateway Time-out',
  '505': 'HTTP Version not supported',
  '506': 'Variant Also Negotiates',    // RFC 2295
  '507': 'Insufficient Storage',       // RFC 4918
  '509': 'Bandwidth Limit Exceeded',
  '510': 'Not Extended'                // RFC 2774
};

});
