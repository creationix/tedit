// JON stands for Jack Object Notation.  It's a subset of the Jack language
// that is suitable for configuration files.  It happens to be a strict superset
// of the JSON language that's often used for data interchange.

var binary = require('bodec');

var patterns = [
  [/^--.*/],
  [/^<([0-9A-F]{2}(?:\s+[0-9A-F]{2})*)>/i, 'BUFFER'],
  [/^(null|true|false)\b/,              'CONSTANT'],
  [/^\"(?:[^\"\\]|\\.)*\"/,             'STRING'],
  [/^'(?:[^'\\]|\\.)*'/,                'STRING'],
  [/^@[a-z]+/,                          'FORM'],
  [/^[A-Z_]([-]?[A-Z0-9_])*[?!]?/i,     'IDENT'],
  [/^:+[A-Z_]([-]?[A-Z0-9_])*[?!]?/i,   'SYMBOL'],
  [/^(-)?0X([0-9A-F]+)/i,               'HEX'],
  [/^[+-]?[1-9][0-9]*/,                 'INTEGER'],
  [/^0/,                                'ZERO'],
  [/^:/,                                ':'],
  [/^\[\s*/,                            '['],
  [/^\s*\]/,                            ']'],
  [/^\{\s*/,                            '{'],
  [/^\s*\}/,                            '}'],
  [/^\s*(?:\r\n|\r|\n|;|,)\s*/,         'TERM'],
  [/^\s+/]
];

var symbols = {};
function Symbol(string) {
  var str = string.substring(1);
  if (symbols[str]) return symbols[str];
  this.str = str;
}
Symbol.prototype.toString = function () {
  return ":" + this.str;
};

var forms = {};
function Form(string) {
  var str = string.substring(1);
  if (forms[str]) return forms[str];
  this.str = str;
}
Form.prototype.toString = function () {
  return "@" + this.str;
};

exports.lex = lex;
function lex(jon) {
  var offset = 0, length = jon.length;
  var num = patterns.length;
  var tokens = [];
  while (offset < length) {
    var start = offset;
    var sub = jon.substring(offset);
    var token, value;
    for (var i = 0; i < num; i++) {
      var pattern = patterns[i];
      var match = sub.match(pattern[0]);
      if (!match) continue;
      value = match[0];
      offset += value.length;
      token = pattern[1];
      if (token) {
        value = token === "BUFFER" ? binary.fromHex(match[1].replace(/\s/g, '')) :
                token === "STRING" ? JSON.parse(value) :
                token === "CONSTANT" ? JSON.parse(value) :
                token === "FORM" ? new Form(value) :
                token === "IDENT" ? value :
                token === "SYMBOL" ? new Symbol(value) :
                token === "HEX" ? parseInt(match[2], 16) * (match[1] ? -1 : 1) :
                token === "INTEGER" ? parseInt(value, 10) :
                token === "ZERO" ? 0 : undefined;
        if (token === "HEX" || token === "ZERO" || token === "INTEGER" ||
            token === "BUFFER" || token === "FORM" || token === "SYMBOL") {
          token = "VALUE";
        }
      }
      break;
    }
    if (i === num) {
      token = "INVALID";
      value = jon[offset++];
    }
    if (!token) continue;
    var out = {
      type: token,
      start: start
    };
    if (value !== undefined) out.value = value;
    // console.log(out);
    tokens.push(out);
  }
  return tokens;
}

exports.parse = parse;
function parse(tokens) {
  if (typeof tokens === "string") tokens = lex(tokens);
  var length = tokens.length;
  var value, offset = 0, token = tokens[offset];

  var out = any();
  while (is("TERM"));
  if (offset < length - 1) fail();
  return out;

  function is(type) {
    token = tokens[offset];
    if (!token) return false;
    if (token.type === type) {
      value = token.value;
      token = tokens[offset++];
      return true;
    }
    return false;
  }

  function fail() {
    if (offset >= length) throw new SyntaxError("Unexpected end of input");
    throw new SyntaxError("Unexpected token " + token.type);
  }

  // An any can be any of:
  //  CONSTANT
  //  Object
  //  Array
  function any() {
    while (is("TERM"));
    if (is("VALUE") || is("STRING")) return value;
    if (is("{")) return object();
    if (is("[")) return list();
    fail();
  }


  function object() {
    var out = {};
    if (is("}")) return out;
    while (is("TERM"));
    while (true) {
      var key;
      if (is("IDENT") || is("STRING")) key = value;
      if (!is(":")) fail();
      out[key] = any();
      var hasTerm = false;
      while (is("TERM")) hasTerm = true;
      if (is("}")) break;
      if (!hasTerm) fail();
    }
    return out;
  }

  function list() {
    var out = [];
    if (is("]")) return out;
    while (is("TERM"));
    while (true) {
      out.push(any());
      var hasTerm = false;
      while (is("TERM")) hasTerm = true;
      if (is("]")) break;
      if (!hasTerm) fail();
    }
    return out;
  }

}
