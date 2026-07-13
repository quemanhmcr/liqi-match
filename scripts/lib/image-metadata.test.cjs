const assert = require('node:assert/strict');
const path = require('node:path');

const { readImageMetadata } = require('./image-metadata.cjs');

const root = path.resolve(__dirname, '../..');
const avatar = readImageMetadata(
  path.join(root, 'assets/simulation/golden-world/avatars/lavender-mage.webp'),
);
const cover = readImageMetadata(
  path.join(root, 'assets/simulation/golden-world/covers/quan-viewer.webp'),
);
const pendingCover = readImageMetadata(
  path.join(
    root,
    'assets/simulation/golden-world/covers/quan-viewer-pending.webp',
  ),
);

assert.deepEqual(avatar, { format: 'webp', height: 1254, width: 1254 });
assert.deepEqual(cover, { format: 'webp', height: 900, width: 1600 });
assert.deepEqual(pendingCover, {
  format: 'webp',
  height: 900,
  width: 1600,
});
assert.equal(avatar.width / avatar.height, 1);
assert.equal(cover.width / cover.height, 16 / 9);

console.log('Image metadata regression check passed.');
