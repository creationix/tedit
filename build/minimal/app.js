/*global CodeMirror domChanger*/
"use strict";


var jkl = '-- Inverted question mark!\n(macro (¿ no yes cond)\n  [[:? cond yes no]]\n)\n\n-- Sample output for 3x3 maze\n\n-- ██████████████\n-- ██      ██  ██\n-- ██  ██████  ██\n-- ██          ██\n-- ██  ██  ██████\n-- ██  ██      ██\n-- ██████████████\n\n(def width 30)\n(def height 30)\n(def size (× width height))\n\n-- Cells point to parent\n(def cells (map (i size) [i null]))\n\n-- Walls flag right and bottom\n(def walls (map (i size) [true true]))\n\n-- Define the sequence of index and right/left\n(def ww (- width 1))\n(def hh (- height 1))\n(def sequence (shuffle (concat\n  (map (i size)\n    (if (< (% i width) ww) [true i])\n  )\n  (map (i size)\n    (if (< (÷ i width) hh) [false i])\n  )\n)))\n\n-- Find the root of a set cell -> cell\n(def (find-root cell)\n  (? (. cell 1) (find-root (. cell 1)) cell)\n)\n\n(for (item sequence)\n  (def i (. item 1))\n  (def root (find-root (. cells i)))\n  (def other (find-root (. cells (+ i (? (. item 0) 1 width)))))\n  (if (≠ (. root 0) (. other 0))\n    (. root 1 other)\n    (. (. walls i) (? (. item 0) 0 1) false)\n  )\n)\n\n(def w (× width 2))\n(def h (× height 2))\n(join "\\n" (map (y (+ h 1))\n  (join "" (map (x (+ w 1))\n    (¿ "  " "██" (or\n      -- Four outer edges are always true\n      (= x 0) (= y 0) (= x w) (= y h)\n      -- Inner cells are more complicated\n      (? (% y 2)\n        (? (% x 2)\n           -- cell middle\n          false\n          -- cell right\n          (. (. walls (+ (÷ (- x 1) 2) (× (÷ y 2) width))) 0)\n        )\n        (? (% x 2)\n          -- cell bottom\n          (. (. walls (+ (÷ x 2) (× (÷ (- y 1) 2) width))) 1)\n          -- cell corner\n          true\n        )\n      )\n    ))\n  ))\n))\n';

domChanger(Desktop, document.body).update();

function Desktop(emit, refresh) {
  var isDark = false;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onResize);
  var width = window.innerWidth;
  var height = window.innerHeight;
  var windows = [
    { title: "bananas/samples/maze.jkl", code: jkl, mode: "jackl" }
  ];

  return {
    render: render,
    on: { destroy: onWindowDestroy }
  };

  function onWindowDestroy(id) {
    windows.splice(windows.indexOf(id), 1);
    refresh();
  }

  function onResize(evt) {
    if (window.innerWidth !== width || window.innerHeight !== height) {
      width = window.innerWidth;
      height = window.innerHeight;
      refresh();
    }
  }

  function onKeyDown(evt) {
    if (evt.ctrlKey && !evt.shiftKey && !evt.altKey && !evt.metaKey && evt.keyCode === 66) {
      evt.preventDefault();
      isDark = !isDark;
      refresh();
    }
  }

  function render() {
    return windows.map(function (props) {
      return [AppWindow, width, height, isDark, props.title,
        [CodeMirrorEditor, isDark, props]
      ];
    });
  }
}

function AppWindow(emit, refresh) {
  var width, height, left, top;
  var maximized = false;
  var dragging = {};
  var id;
  var usePointer = !!window.PointerEvent;
  if (usePointer) {
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
  }
  else {
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchmove", onTouchMove);
  }

  var northProps = drag(north);
  var northEastProps = drag(northEast);
  var eastProps = drag(east);
  var southEastProps = drag(southEast);
  var southProps = drag(south);
  var southWestProps = drag(southWest);
  var westProps = drag(west);
  var northWestProps = drag(northWest);
  var titleBarProps = drag(titleBar);

  return {
    render: render,
    cleanup: cleanup
  };

  function cleanup() {
    if (usePointer) {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
    }
    else {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchmove", onTouchMove);
    }
  }

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

  function onPointerMove(evt) {
    var id = evt.pointerId;
    if (!dragging[id]) return;
    evt.preventDefault();
    evt.stopPropagation();
    move(id, evt.clientX, evt.clientY);
  }

  function onPointerUp(evt) {
    var id = evt.pointerId;
    if (!dragging[id]) return;
    evt.preventDefault();
    evt.stopPropagation();
    stop(id);
  }

  function onTouchMove(evt) {
    var found = false;
    for (var i = 0; i < evt.changedTouches.length; i++) {
      var touch = evt.changedTouches[i];
      var id = touch.identifier;
      if (dragging[id]) {
        found = true;
        move(id, touch.clientX, touch.clientY);
      }
    }
    if (found) {
      evt.preventDefault();
      evt.stopPropagation();
    }
  }

  function onTouchEnd(evt) {
    var found = false;
    for (var i = 0; i < evt.changedTouches.length; i++) {
      var touch = evt.changedTouches[i];
      var id = touch.identifier;
      if (dragging[id]) {
        found = true;
        stop(id);
      }
    }
    if (found) {
      evt.preventDefault();
      evt.stopPropagation();
    }
  }

  function onMouseMove(evt) {
    if (!dragging.mouse) return;
    evt.preventDefault();
    evt.stopPropagation();
    move("mouse", evt.clientX, evt.clientY);
  }

  function onMouseUp(evt) {
    if (!dragging.mouse) return;
    evt.preventDefault();
    evt.stopPropagation();
    stop("mouse");
  }

  function drag(fn) {
    return usePointer ? {
      onpointerdown: onPointerDown
    } : {
      onmousedown: onMouseDown,
      ontouchstart: onTouchStart
    };

    function onPointerDown(evt) {
      var id = evt.pointerId;
      if (dragging[id]) return;
      evt.preventDefault();
      evt.stopPropagation();
      start(id, evt.clientX, evt.clientY, fn);
    }

    function onTouchStart(evt) {
      var found = false;
      for (var i = 0; i < evt.changedTouches.length; i++) {
        var touch = evt.changedTouches[i];
        var id = touch.identifier;
        if (!dragging[id]) {
          found = true;
          start(id, touch.clientX, touch.clientY, fn);
        }
      }
      if (found) {
        evt.preventDefault();
        evt.stopPropagation();
      }
    }

    function onMouseDown(evt) {
      if (dragging.mouse) return;
      evt.preventDefault();
      evt.stopPropagation();
      start("mouse", evt.clientX, evt.clientY, fn);
    }
  }

  function start(id, x, y, fn) {
    dragging[id] = {
      x: x,
      y: y,
      fn: fn
    };
  }

  function move(id, x, y) {
    var data = dragging[id];
    data.fn(x - data.x, y - data.y);
    data.x = x;
    data.y = y;
  }

  function stop(id) {
    dragging[id] = null;
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

function CodeMirrorEditor() {
  var code, mode, theme;
  var el;
  var cm = new CodeMirror(function (root) {
    el = root;
  }, {
    keyMap: "sublime",
    // lineNumbers: true,
    rulers: [{ column: 80 }],
    autoCloseBrackets: true,
    matchBrackets: true,
    showCursorWhenSelecting: true,
    styleActiveLine: true,
  });
  setTimeout(function () {
    cm.refresh();
  }, 0);

  return { render: render };

  function render(isDark, props) {
    var newTheme = isDark ? "notebook-dark" : "notebook";
    if (newTheme !== theme) {
      theme = newTheme;
      cm.setOption("theme", theme);
    }
    if (props.mode !== mode) {
      mode = props.mode;
      cm.setOption("mode", mode);
    }
    if (props.code !== code) {
      code = props.code;
      cm.setValue(code);
    }
    return el;
  }
}
