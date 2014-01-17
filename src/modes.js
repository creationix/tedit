/*global define*/
define("modes", function () {
  return {
    isBlob: function (mode) {
      return (mode & 0140000) === 0100000;
    },
    isFile: function (mode) {
      return (mode & 160000) === 0100000;
    },
    isExecutable: function (mode) {
      return (mode & 1);
    },
    isTree: function (mode) {
      return mode === 040000;
    },
    isSymlink: function (mode) {
      return mode === 0120000;
    },
    isCommit: function (mode) {
      return mode === 0160000;
    },
    tree:    040000,
    blob:   0100644,
    exec:   0100755,
    sym:    0120000,
    commit: 0160000
  };
});