/*global define, ace*/
define("editor", function () {
  "use strict";

  var $ = require('elements');
  // Put sample content and liven the editor
  var editor = ace.edit($.editor);
  var textMode = true;
  var currentImage = null;

  var code = jack.toString().substr(20);
  code = code.substr(0, code.length - 5);
  code = code.split("\n").map(function (line) { return line.substr(4); }).join("\n");
  editor.setValue(code, 1);
  editor.setTheme("ace/theme/ambiance");
  editor.setShowInvisibles(true);
  var session = editor.getSession();
  session.setMode("ace/mode/jack");
  session.setTabSize(2);
  editor.fallbackSession = session;
  var realSetSession = editor.setSession;

  $.image.addEventListener("click", function (evt) {
    evt.stopPropagation();
    evt.preventDefault();
    if (currentImage) {
      currentImage.tiled = !currentImage.tiled;
      updateImage();
    }
  }, false);

  editor.setSession = function (session) {
    if ("tiled" in session) {
      // This is an image url.
      if (textMode) {
        textMode = false;
        $.preview.style.display = "block";
        $.editor.style.display = "none";
      }
      currentImage = session;
      return updateImage();
    }
    if (!textMode) {
      currentImage = null;
      textMode = true;
      $.preview.style.display = "none";
      $.editor.style.display = "block";
    }
    return realSetSession.apply(editor, arguments);
  };

  require('zoom')(onZoom);

  function onZoom(scale) {
    editor.setFontSize(16 * scale);
  }



  function updateImage() {
    var img = currentImage;
    $.image.style.backgroundImage = "url(" + img.url + ")";
    if (img.tiled) $.image.classList.remove("zoom");
    else $.image.classList.add("zoom");
  }


  function jack() {/*
    [ "Welcome to the Tedit Chrome App alpha preview"
      "This Developement Environment is under heavy development" ]
    -- This file is written in Jack, a new language for kids!
    vars Global-Controls, File-Tree-Controls, Mouse-and-Touch-Controls

    "Right-Click in the area to the left to create a new repo"

    Global-Controls = {
      Control-Shift-R: "Reload the app"
      Alt-T: "Toggle focus between editor and file tree"
      -- If you manually close the tree by dragging, toggle remembers this.
      Control-Plus: "Increase font size"
      Control-Minus: "Decrease font size"
    }

    File-Tree-Controls = {
      Up: "Move the selection up"
      Down: "Move the selection down"
      Left: "Close the current folder or move to parent folder"
      Down: "Open the current folder or move to first child"
      Home: "Jump to top of list"
      End: "Jump to end of list"
      Page-Up: "Go up 10 times"
      Page-Down: "Go dowm 10 times"
      When-on-folder: {
        Space-or-Enter: "Toggle folder open and close"
      }
      When-on-file: {
        Enter: "Open file and move focus to editor"
        Space: "Open file, but keep focus"
      }
    }

    Mouse-and-Touch-Controls = {
      Drag-Titlebar: "Move the window"
      Drag-Gutter: "Resize Panes"
      Click-Directory: "Toggle open/close on directory"
      Click-File: "Select file"
      Click-Selected-File: "Open file and focus on Editor"
      Click-Activated-File: "Deactivate file"
    }
  */}

  return editor;
});
