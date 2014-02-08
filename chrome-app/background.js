/*global chrome*/
chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('/index.html', {
    id: "tedit",
    frame: "none",
    minWidth: 950,
    minHeight: 550
  });
});
