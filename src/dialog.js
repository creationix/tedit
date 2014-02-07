/*global define*/
define("dialog", function () {
  "use strict";

  var domBuilder = require('dombuilder');

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
      [".shield$shield", {onclick: cancel}],
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

  function exportConfigDialog(path, callback) {
    var $ = dialog("Live Export", [
    ], onCancel);

    function onCancel(evt) {
      nullify(evt);
      $.close();
      callback();
    }
  }

});