/*global define*/
define("dialog", function () {
  "use strict";

  var domBuilder = require('dombuilder');

  // dialog.alert = alertDialog;
  dialog.prompt = promptDialog;
  dialog.confirm = confirmDialog;

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

});