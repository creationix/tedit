var store = new WeakMap();

// Associate a storage object with any object.
module.exports = function (object) {
  var value = store.get(object);
  if (!value) store.set(object, value = {});
  return value;
};
