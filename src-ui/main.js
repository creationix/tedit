var domChanger = require('domchanger/domchanger.js');

function* sleep(ms) {
  yield function (callback) {
    setTimeout(callback, ms);
  };
}


console.log("HI");
yield* sleep(1000);
console.log("BYE");