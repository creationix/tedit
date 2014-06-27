"use strict";

var drag = require('./drag-helper');

module.exports = AppWindow;

function AppWindow(emit, refresh) {
  var width, height, left, top;
  var maximized = false;
  var id;

  var northProps = drag(north);
  var northEastProps = drag(northEast);
  var eastProps = drag(east);
  var southEastProps = drag(southEast);
  var southProps = drag(south);
  var southWestProps = drag(southWest);
  var westProps = drag(west);
  var northWestProps = drag(northWest);
  var titleBarProps = drag(titleBar);

  return { render: render };

  function render(windowWidth, windowHeight, isDark, title, child) {
    id = child;

    if (width === undefined) {
      width = (windowWidth / 2) | 0;
      height = (windowHeight / 2) | 0;
      left = ((windowWidth - width) / 2) | 0;
      top = ((windowHeight - height) / 2) | 0;
    }

    // Manually run constraints that edges must be inside desktop and
    // window must be at least 200x100
    var right = left + width;
    if (right < 10) right = 10;
    if (left > windowWidth - 10) left = windowWidth - 10;
    var mid = ((left + right) / 2) | 0;
    if (mid < ((windowWidth / 2) | 0)) {
      if (right < left + 200) right = left + 200;
      width = right - left;
      if (width > windowWidth) {
        left += width - windowWidth;
        width = windowWidth;
      }
    }
    else {
      if (left > right - 200) left = right - 200;
      width = right - left;
      if (width > windowWidth) width = windowWidth;
    }

    var bottom = top + height;
    if (bottom < 10) bottom = 10;
    if (top > windowHeight - 10) top = windowHeight - 10;
    mid = ((top + bottom) / 2) | 0;
    if (mid < ((windowHeight / 2) | 0)) {
      if (bottom < top + 100) bottom = top + 100;
      height = bottom - top;
      if (height > windowHeight) {
        top += height - windowHeight;
        height = windowHeight;
      }
    }
    else {
      if (top > bottom - 100) top = bottom - 100;
      height = bottom - top;
      if (height > windowHeight) height = windowHeight;
    }

    var style = maximized ? {
      top: "-10px",
      left: "-10px",
      right: "-10px",
      bottom: "-10px"
    } : {
      width: width + "px",
      height: height + "px",
      transform: "translate3d(" + left + "px," + top + "px,0)",
      webkitTransform: "translate3d(" + left + "px," + top + "px,0)",
      // left: left + "px",
      // top: top + "px",
    };
    return ["dialog.window", {
        style: style, class: isDark ? "dark" : "light"
      },
      ["article.content", child],
      [".resize.n", northProps],
      [".resize.ne", northEastProps],
      [".resize.e", eastProps],
      [".resize.se", southEastProps],
      [".resize.s", southProps],
      [".resize.sw", southWestProps],
      [".resize.w", westProps],
      [".resize.nw", northWestProps],
      [".title-bar", titleBarProps, title],
      [".max-box", {onclick:onMaxClick}, maximized ? "▼" : "▲"],
      [".close-box", {onclick:onCloseClick},"✖"],
    ];
  }

  function onMaxClick(evt) {
    evt.stopPropagation();
    maximized = !maximized;
    refresh();
  }

  function onCloseClick(evt) {
    evt.stopPropagation();
    emit("destroy", id);
  }

  function north(dx, dy) {
    height -= dy;
    top += dy;
    refresh();
  }
  function northEast(dx, dy) {
    height -= dy;
    top += dy;
    width += dx;
    refresh();
  }
  function east(dx, dy) {
    width += dx;
    refresh();
  }
  function southEast(dx, dy) {
    height += dy;
    width += dx;
    refresh();
  }
  function south(dx, dy) {
    height += dy;
    refresh();
  }
  function southWest(dx, dy) {
    height += dy;
    width -= dx;
    left += dx;
    refresh();
  }
  function west(dx, dy) {
    width -= dx;
    left += dx;
    refresh();
  }
  function northWest(dx, dy) {
    height -= dy;
    top += dy;
    width -= dx;
    left += dx;
    refresh();
  }
  function titleBar(dx, dy) {
    top += dy;
    left += dx;
    refresh();
  }
}
