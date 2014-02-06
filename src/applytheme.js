/*global define*/
define("applytheme", function () {
  "use strict";

  var template = {
    ".tree": {
      "color": [".ace_text-layer", ""],
      "background-color": [".ace_text-layer", ""],
      "background": [".ace_text-layer", ""],
      "background-image": [".ace_text-layer", ""]
    },
    ".tree .row.active": {
      "background-color": "#333"
    },
    ".tree .row.selected, .tree .row:hover": {
      "box-shadow": "inset 0 0 0.3em rgba(255,255,255,0.6);"
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
    ".theme-light .titlebar": {
      "color": [".ace_gutter"],
      "background-color": [".ace_gutter"],
      "background": [".ace_gutter"],
      "background-image": [".ace_gutter"],
    },
    ".theme-dark .titlebar": {
      "background-color": [".ace_gutter"],
      "background": [".ace_gutter"],
      "background-image": [".ace_text-layer", ".ace_gutter"],
    }
  };

  var tag;

  return function (rules, theme) {

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
    // console.log(css);
    if (tag) document.head.removeChild(tag);
    tag = document.createElement("style");
    tag.setAttribute("data-theme", theme.theme);
    tag.textContent = css;
    document.head.appendChild(tag);
  };
});
