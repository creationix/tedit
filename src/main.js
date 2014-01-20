/*global define*/
define("main", function () {
  "use strict";
  require('prefs').init(function () {
    require('window-keys');
    require('repos');
    require('slider');
    require('tree');
    require('editor');
  });
});