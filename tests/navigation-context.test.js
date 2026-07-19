const assert = require("node:assert/strict");

global.window = {};
require("../js/navigation-context.js");

const navigation = window.navigationContext;

assert.deepEqual(navigation.availability(), {
  active: false,
  canPrevious: false,
  canNext: false
});

navigation.setPlaylist("culto", [10, 20, 30], 0);
assert.deepEqual(navigation.availability(), {
  active: true,
  canPrevious: false,
  canNext: true
});
assert.equal(navigation.move(-1), null);
assert.equal(navigation.move(1).songId, 20);
assert.deepEqual(navigation.availability(), {
  active: true,
  canPrevious: true,
  canNext: true
});
assert.equal(navigation.move(1).songId, 30);
assert.deepEqual(navigation.availability(), {
  active: true,
  canPrevious: true,
  canNext: false
});
assert.equal(navigation.move(1), null);
assert.equal(navigation.get().playlistId, "culto");
assert.deepEqual(navigation.get().songIds, [10, 20, 30]);

navigation.clear();
assert.equal(navigation.get(), null);

console.log("navigation-context.test.js: OK");
