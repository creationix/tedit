"use strict";
/*global ace*/

var parseCss = require('lib/css-parse');

var template = {
  ".tree": {
    "color": [".ace_text-layer", ""],
    "background-color": [".ace_text-layer", ""],
    "background": [".ace_text-layer", ""],
    "background-image": [".ace_text-layer", ""]
  },
  ".tree .icon-attention": {
    "color": "#f72;"
  },
  ".tree .icon-fork": {
    "color": [".ace_type", ".ace_punctuation.ace_operator", ".ace_punctuation", ".ace_keyword"]
  },
  ".tree .icon-folder-open, .tree .icon-folder": {
    "color": [".ace_comment"]
  },
  ".tree .icon-doc": {
    "color": [".ace_string"]
  },
  ".tree .icon-link": {
    "color": [".ace_keyword.ace_operator", ".ace_keyword"]
  },
  ".tree .icon-cog": {
    "color": [".ace_variable"]
  },
  ".tree span": {
    "color": [".ace_identifier"]
  },
  ".titlebar, body": {
    "color": [".ace_gutter"],
    "background-color": [".ace_gutter"],
    "background": [".ace_gutter"],
    "background-image": [".ace_gutter"],
  },
  ".titlebar, .dialog .title, .input-item": {
    "background-color": [".ace_gutter"],
    "background": [".ace_gutter"],
    "background-image": [".ace_text-layer", ".ace_gutter"],
    "color": [""]
  },
  ".input-item[type=submit], .input-field[type=submit]": {
    "color": [".ace_type", ".ace_punctuation.ace_operator", ".ace_punctuation", ".ace_keyword", ""]
  },
  ".input-field": {
    "background-color": [""],
    "color": [""]
  }

};

var tag;

module.exports = function (theme) {
  var aceTheme = ace.require(theme.theme);
  if (!theme) return {};
  var cssClass = aceTheme.cssClass;
  var prefix = new RegExp("^." + cssClass + " ");
  var rules = {};
  try {
    // Fix a typo in the kuroir theme
    var aceCss = aceTheme.cssText.replace("background-color: ;", "");

    parseCss(aceCss).stylesheet.rules.forEach(function (rule) {
      if (rule.type !== "rule") return;
      var declarations = {};
      rule.declarations.forEach(function (declaration) {
        if (declaration.type !== "declaration") return;
        declarations[declaration.property] = declaration.value;
      });
      rule.selectors.forEach(function (selector) {
        if (selector === "." + cssClass) selector += " ";
        if (!prefix.test(selector)) return;
        var name = selector.replace(prefix, "");
        rules[name] = declarations;
      });
    });
  }
  catch (err) {
    console.log(aceTheme.cssText);
    console.error(theme.theme, err.toString());
    return {};
  }

  // console.log(rules);
  var css = Object.keys(template).map(function (name) {
    var props = template[name];
    var contents = Object.keys(props).map(function (key) {
      var values = props[key];
      if (!Array.isArray(values)) return "  " + key + ":" + values + ";";

      for (var i = 0, l = values.length; i < l; i++) {
        var option = values[i];
        var rule = rules[option];
        if (rule && rule[key]) {
          // console.log("Matched", [name, key, option, rule[key]]);
          return "  " + key + ":" + rule[key] + ";";
        }
      }
      if (i === l) {
        // console.warn("Not Matched", [name, key]);
        return "";
      }

    }).join("\n").trim();
    if (!contents) return;
    return name + "{\n  " + contents + "\n}";
  }).join("\n");

  if (tag) document.head.removeChild(tag);
  tag = document.createElement("style");
  tag.setAttribute("data-theme", theme.theme);
  tag.textContent = css;
  document.head.appendChild(tag);
};
