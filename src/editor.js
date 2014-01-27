/*global define, ace*/
define("editor", function () {
  "use strict";

  var $ = require('elements');
  var whitespace = ace.require('ace/ext/whitespace');
  var domBuilder = require('dombuilder');
  // Put sample content and liven the editor

  var code = jack.toString().substr(20);
  code = code.substr(0, code.length - 5);
  code = code.split("\n").map(function (line) { return line.substr(4); }).join("\n");

  var editor = ace.edit($.editor);
  editor.setValue(code, 1);
  editor.setTheme("ace/theme/ambiance");
  // editor.setShowInvisibles(true);

  var textMode = true;
  var currentDoc = null;

  var session = ace.createEditSession(code, "ace/mode/jack");
  whitespace.detectIndentation(session);
  session.path = "Tedit";

  $.image.addEventListener("click", function (evt) {
    evt.stopPropagation();
    evt.preventDefault();
    if (currentDoc) {
      currentDoc.tiled = !currentDoc.tiled;
      updateImage();
    }
  }, false);

  editor.setDoc = function (doc) {
    if (!doc) doc = session;
    currentDoc = doc;

    if ("tiled" in doc) {
      // This is an image url.
      if (textMode) {
        textMode = false;
        $.preview.style.display = "block";
        $.editor.style.display = "none";
      }
      return updateImage();
    }
    if (!textMode) {
      textMode = true;
      $.preview.style.display = "none";
      $.editor.style.display = "block";
    }
    editor.setSession(doc);
    if (!doc.updateTitle) doc.updateTitle = updateTitle;
    doc.updateTitle();
  };

  function updateTitle() {
    var doc = this;
    if (currentDoc !== doc) return;
    var index = doc.path.lastIndexOf("/");
    $.titlebar.textContent = "";
    $.titlebar.appendChild(domBuilder([
      ["span.fade", doc.path.substr(0, index + 1)],
      ["span", doc.path.substr(index + 1)],
    ]));

  }

  editor.setDoc();

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
