(function() {
"use strict";
/*global ace*/

var domBuilder = require('dombuilder');

var notify = require('./notify');
var $ = require('./elements');
var prefs = require('prefs');
var zoom = require('./zoom');

ace.require("ace/ext/language_tools"); // Trigger the extension.
var whitespace = ace.require('ace/ext/whitespace');
var themes = ace.require('ace/ext/themelist').themesByName;
var themeNames = Object.keys(ace.require('ace/ext/themelist').themesByName);
var themeIndex = prefs.get("themeIndex", themeNames.indexOf("idle_fingers"));

// Put sample content and liven the editor

var code = jack.toString().substr(20);
code = code.substr(0, code.length - 4);
code = code.split("\n").map(function (line) { return line.substr(2); }).join("\n");

var editor = ace.edit($.editor);
editor.setTheme = setTheme;
editor.prevTheme = prevTheme;
editor.nextTheme = nextTheme;
editor.focused = false;

// Turn on autocompletion
editor.setOptions({
  enableBasicAutocompletion: true,
  // enableSnippets: true
});

zoom(onZoom);


// Use Tab for autocomplete
function shouldComplete(editor) {
  if (editor.getSelectedText()) {
    return false;
  }
  var session = editor.getSession();
  var doc = session.getDocument();
  var pos = editor.getCursorPosition();

  var line = doc.getLine(pos.row);
  return ace.require("ace/autocomplete/util").retrievePrecedingIdentifier(line, pos.column);
}
editor.commands.addCommand({
  name: "completeOrIndent",
  bindKey: "Tab",
  exec: function(editor) {
    if (shouldComplete(editor)) {
      editor.execCommand("startAutocomplete");
    } else {
      editor.indent();
    }
  }
});

editor.updatePath = function (doc) {
  if (doc !== currentDoc) return;
  updateTitle(doc.row.path);
};

setTheme(themeNames[themeIndex], true);
editor.on("blur", function () {
  editor.focused = false;
  if (currentDoc && currentDoc.save) save();
});
editor.on("focus", function () {
  editor.focused = true;
});
editor.on("change", function () {
  if (currentDoc && currentDoc.onChange) currentDoc.onChange(currentDoc.session.getValue());
});
editor.commands.addCommand({
  name: 'save',
  bindKey: {win: 'Ctrl-S',  mac: 'Command-S'},
  exec: function() {
    if (currentDoc && currentDoc.save) save();
  },
  readOnly: false
});

editor.saveToGit = save;
function save() {

  if (!currentDoc.session) return;
  // Trim trailing whitespace.
  var doc = currentDoc.session.getDocument();
  var lines = doc.getAllLines();
  for (var i = 0, l = lines.length; i < l; i++) {
      var line = lines[i];
      var index = line.search(/\s+$/);
      if (index >= 0) doc.removeInLine(i, index, line.length);
  }

  // Remove extra trailing blank lines
  while (--i >= 0) if (/\S/.test(lines[i])) break;
  if (i < l - 2) doc.removeLines(i + 2, l - 1);

  currentDoc.save(currentDoc.session.getValue());
}

var textMode = true;
var currentDoc = null;

var fallback = {
  session: ace.createEditSession(code, "ace/mode/jack"),
  row: {path: "Tedit"}
};
whitespace.detectIndentation(fallback.session);

$.image.addEventListener("click", function (evt) {
  evt.stopPropagation();
  evt.preventDefault();
  if (currentDoc) {
    currentDoc.tiled = !currentDoc.tiled;
    updateImage();
  }
}, false);

editor.getText = function () {
  return currentDoc.session.getValue();
};

editor.setDoc = function (doc) {
  if (!doc) doc = fallback;
  currentDoc = doc;

  if (doc.session) {
    editor.setSession(doc.session);
  }
  updateTitle(doc.row.path);

  if (doc.url) {
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
};

function updateTitle(path) {
  var index = path.lastIndexOf("/");
  $.titlebar.textContent = "";
  $.titlebar.appendChild(domBuilder([
    ["span.fade", path.substr(0, index + 1)],
    ["span", path.substr(index + 1)],
  ]));
}

editor.setDoc();

function onZoom(scale) {
  editor.setFontSize(16 * scale);
}

function updateImage() {
  var img = currentDoc;
  $.image.style.backgroundImage = "url(" + img.url + ")";
  if (img.tiled) $.image.classList.remove("zoom");
  else $.image.classList.add("zoom");
}

function setTheme(name, quiet) {
  var theme = themes[name];
  document.body.setAttribute("class", "theme-" + (theme.isDark ? "dark" : "light"));
  editor.renderer.setTheme(theme.theme, function () {
    require('./applytheme')(theme);
    if (!quiet) notify(theme.caption);
  });
}

function nextTheme() {
  themeIndex = (themeIndex + 1) % themeNames.length;
  prefs.set("themeIndex", themeIndex);
  setTheme(themeNames[themeIndex]);
}

function prevTheme() {
  themeIndex = (themeIndex - 1);
  if (themeIndex < 0) themeIndex += themeNames.length;
  prefs.set("themeIndex", themeIndex);
  setTheme(themeNames[themeIndex]);
}

module.exports = editor;

}());

function jack() {/*
  [ "Welcome to the Tedit Workspace"
    "This Development Environment is under heavy development" ]
  -- This file is written in Jack, a new language for kids!
  vars Global-Controls, File-Tree-Controls, Mouse-and-Touch-Controls

  "Right-Click in the area to the left to create a new repo"

  Global-Controls = {
    Control-Shift-R: "Reload the app"
    Control-Plus: "Increase font size"
    Control-Minus: "Decrease font size"
    Control-B: "Apply next Theme"
    Control-Shift-B: "Apply previous Theme"
    Control-E: "Toggle focus between editor and file tree"
    Control-N: "Create new file relative to current or selected"
    Alt-Tilde: "Switch between recently opened files"
    -- If you manually close the tree by dragging, toggle remembers this.
  }

  File-Tree-Controls = {
    Up: "Move the selection up"
    Down: "Move the selection down"
    Left: "Close the current folder or move to parent folder"
    Right: "Open the current folder or move to first child"
    Home: "Jump to top of list"
    End: "Jump to end of list"
    Page-Up: "Go up 10 times"
    Page-Down: "Go down 10 times"
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
