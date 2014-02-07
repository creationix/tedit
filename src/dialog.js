/*global define, chrome*/
define("dialog", function () {
  "use strict";

  var domBuilder = require('dombuilder');
  var fileSystem = chrome.fileSystem;

  // dialog.alert = alertDialog;
  dialog.prompt = promptDialog;
  dialog.confirm = confirmDialog;
  dialog.multiEntry = multiEntryDialog;
  dialog.exportConfig = exportConfigDialog;

  return dialog;

  function nullify(evt) {
    if (!evt) return;
    evt.stopPropagation();
    evt.preventDefault();
  }

  function dialog(title, contents, onCancel) {
    var $ = { close: closeDialog };
    document.body.appendChild(domBuilder([
      [".shield$shield", {onclick: cancel, oncontextmenu: cancel}],
      [".dialog$dialog",
        [".title",
          [".content", title],
          [".closebox",{onclick: cancel}, "×"]
        ],
        [".body", contents]
      ]
    ], $));
    $.cancel = cancel;
    return $;

    function cancel(evt) {
      nullify(evt);
      onCancel();
    }

    function closeDialog() {
      document.body.removeChild($.shield);
      document.body.removeChild($.dialog);
    }
  }

  function promptDialog(prompt, value, callback) {
    var $ = dialog(prompt, [
      ["form", {onsubmit: submit},
        [".input",
          ["input.input-field$input", {value:value}],
          ["input.input-item", {type:"submit",value:"OK"}]
        ]
      ]
    ], onCancel);
    $.input.focus();
    return $;

    function onCancel() {
      $.close();
      callback();
    }

    function submit(evt) {
      nullify(evt);
      $.close();
      callback($.input.value);
    }
  }

  function multiEntryDialog(title, entries, callback) {
    var $ = dialog(title, ["form$form", {onsubmit: submit},
      entries.map(function (entry, i) {
        var row = [".input",
          ["input.input-field", entry],
        ];
        if (i === entries.length - 1) {
          row.push(["input.input-item", {type:"submit",value:"OK"}]);
        }
        return row;
      })
    ], onCancel);
    $.form.elements[0].focus();

    function onCancel() {
      $.close();
      callback();
    }

    function submit(evt) {
      nullify(evt);
      var result = {};
      entries.forEach(function (entry, i) {
        var value = $.form.elements[i].value;
        result[entry.name] = value;
      });
      $.close();
      callback(result);
    }


  }

  function confirmDialog(question, callback) {
    var $ = dialog("Confirm", [
      ["p", question],
      ["form", {onsubmit: submit},
        [".input",
          ["input.input-field$yes", {type:"submit",value:"Yes"}],
          ["input.input-item", {type:"button",value:"No",onclick:onCancel}]
        ]
      ]
    ], onCancel);
    $.yes.focus();
    return $;

    function onCancel(evt) {
      nullify(evt);
      $.close();
      callback();
    }

    function submit(evt) {
      nullify(evt);
      $.close();
      callback(true);
    }
  }

  function exportConfigDialog(config, callback) {
    var entry;
    var $ = dialog("Live Export", [
      ["form", {onsubmit: submit},
        ["label", {"for": "target"}, "Target Parent Folder"],
        [".input",
          ["input.input-field$target", {
            name: "target",
            onclick: chooseFolder,
            onkeyup: reset,
            required: true
          }],
          ["button.input-item", {onclick: chooseFolder}, "Choose..."]
        ],
        ["label", {"for": "name"}, "Target Name"],
        [".input",
          ["input.input-field$name", {
            name: "name",
            value: config.name,
            required: true
          }],
        ],
        ["label", {"for": "source"}, "Source Path"],
        [".input",
          ["input.input-field$source", {
            name: "source",
            value: config.source,
            required: true
          }],
        ],
        ["label", {"for": "filters"}, "Filters Path"],
        [".input",
          ["input.input-field$filters", {
            name: "filters",
            value: config.filters,
            required: true
          }],
          ["input.input-item$submit", {type:"submit",value:"OK"}]
        ]
      ]
    ], onCancel);

    if (config.entry) {
      return fileSystem.isRestorable(config.entry, onCheck);
    }
    return reset();

    function onCheck(isRestorable) {
      if (!isRestorable) {
        delete config.entry;
        return reset();
      }
      return fileSystem.restoreEntry(config.entry, onEntry);
    }

    function onEntry(result) {
      if (result) entry = result;
      return reset();
    }

    function onCancel(evt) {
      nullify(evt);
      $.close();
      callback();
    }

    function reset() {
      $.target.value = entry && entry.fullPath || "";
    }

    function submit(evt) {
      nullify(evt);

      config.source = $.source.value;
      config.name = $.name.value;
      config.filters = $.filters.value;
      config.entry = fileSystem.retainEntry(entry);
      $.close();
      callback(config);
    }

    function chooseFolder(evt) {
      nullify(evt);
      return fileSystem.chooseEntry({ type: "openDirectory"}, onEntry);
    }

  }

});