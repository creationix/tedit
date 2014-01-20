tedit-app
=========

Chrome app for tedit

Install Alpha preview at the Chrome [Web Store](https://chrome.google.com/webstore/detail/tedit-development-environ/ooekdijbnbbjdfjocaiflnjgoohnblgf)

![Screenshot of alpha version](http://creationix.com/tedit-0.0.2-wide.png)

If you want to test this, the easiest way is to use the chrome store link above.  But if you want the latest bleeding edge version, it's simple to build this from source.

 - Clone this repo `git clone git@github.com:creationix/tedit-app.git`
 - Download ace `cd tedit-app && sh install-ace.sh`
 - Import into chrome:
   - Go to <chrome://extensions>
   - Check "Developer mode" if you haven't already.
   - Click on "Load unpacked extension..." and browse to the `tedit-app` folder.
   - Click "Launch" on the newly installed extension/app.
