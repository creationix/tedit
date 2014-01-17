/*global define*/
define("main", function () {
  "use strict";
  require('prefs').init(function () {
    require('repos');
    require('window-keys');
    require('slider');
    require('tree');
    require('editor');
  });
});