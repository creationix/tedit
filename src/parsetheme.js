/*global define, ace*/

// Given the name to an ace theme, extract the css declarations by selector.
define("parsetheme", function () {
  "use strict";
  var parseCss = require('css-parse');
  return function (themeName) {
    var theme = ace.require(themeName);
    if (!theme) return {};
    var cssClass = theme.cssClass;
    var prefix = new RegExp("^." + cssClass + " ");
    var rules = {};
    try {
      // Fix a typo in the kuroir theme
      var css = theme.cssText.replace("background-color: ;", "");

      parseCss(css).stylesheet.rules.forEach(function (rule) {
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
      console.log(theme.cssText)
      console.error(themeName, err.toString());
      return {};
    }
    return rules;
  };
});