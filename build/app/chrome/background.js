/*global chrome*/
chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('/index.html', {
    id: "tedit",
    frame: "none",
    width: 950,
    height: 550
  });
});
