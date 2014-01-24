/*global define*/
define("dialog", function () {
  "use strict";

  var domBuilder = require('dombuilder');

  // dialog.alert = alertDialog;
  dialog.prompt = promptDialog;
  // dialog.confirm = confirmDialog;

  return dialog;

  function nullify(evt) {
    if (!evt) return;
    evt.stopPropagation();
    evt.preventDefault();
  }

  function dialog(title, contents) {
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
      $.onCancel();
    }

    function closeDialog() {
      document.body.removeChild($.shield);
      document.body.removeChild($.dialog);
    }
  }

  function promptDialog(prompt, callback) {
    var $ = dialog(prompt, [
      ["form", {onsubmit: submit},
        ["input$input"],
        ["input", {type:"submit",value:"OK"}],
        ["input", {type:"button",value:"Cancel",onclick:onCancel}]
      ]
    ]);
    $.onCancel = onCancel;
    $.input.focus();
    return $;

    function onCancel(evt) {
      nullify(evt);
      $.close();
      callback();
    }

    function submit(evt) {
      nullify(evt);
      $.close();
      callback($.input.value);
    }

  }

});