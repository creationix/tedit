tedit-app
=========

Tedit is a git based development environment.  When I say git based I mean you
don't edit files on disk.  You edit git databases directly.  Visually it looks
much like a traditional editor complete with file tree and editor pane.  Under
the hood, you are browsing the git database graph and creating new nodes and
updating the root reference whenever you make a change.

The purpose of Tedit is to create a development platform that makes programming
JavaScript easy and more accessable.  It runs great on ChromeBooks and soon
there will be a hosted web version that runs on mobile browsers on tablets.

Install at the Chrome [Web Store](https://chrome.google.com/webstore/detail/tedit-development-environ/ooekdijbnbbjdfjocaiflnjgoohnblgf)

## Hacking on Tedit

So you decided you want to help me build this awesome tool.  That's great.

First, Tedit is a self-hosting compiler / editor / platform.  This means you
need Tedit to build Tedit.  Go get the chrome store version if you haven't
already.

Visual walkthrough: <https://cloudup.com/cCMNHjdCw6q>

 - If you don't have a github token handy, create a new one at <https://github.com/settings/tokens/new>
 - Launch the [pre-built version of Tedit](https://chrome.google.com/webstore/detail/tedit-development-environ/ooekdijbnbbjdfjocaiflnjgoohnblgf) and using the context menu (right-click) in the
   empty pane to the left, select "Live Mount Github Repo"
 - Enter `creationix/tedit-app` (or your fork if you want write access) in the first field and paste your token in the last.
 - Right-Click on the `chrome-app` folder in the new tree and select "Live Export to Disk".
 - Select a parent folder (I usually do Desktop) and a name for the target (I like `tedit`).
 - Watch the save icon spin while it exports the files to disk.
 - When done, open Chrome to <chrome://extensions>, enable developer mode, and add the exported folder as an unpacked extension.
 - Launch the generated version of tedit.  I recommend changing the color of this second version using `Control+B` to tell them apart.
