const fs = require('node:fs');

function readImageMetadata(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (isPng(buffer)) return readPng(buffer);
  if (isJpeg(buffer)) return readJpeg(buffer);
  if (isWebp(buffer)) return readWebp(buffer);
  throw new Error(`Unsupported or corrupt image: ${filePath}`);
}

function isPng(buffer) {
  return (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  );
}

function readPng(buffer) {
  return {
    format: 'png',
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  };
}

function isJpeg(buffer) {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function readJpeg(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > buffer.length) break;
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        format: 'jpg',
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += length + 2;
  }
  throw new Error('JPEG dimensions not found');
}

function isWebp(buffer) {
  return (
    buffer.length >= 30 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

function readWebp(buffer) {
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      format: 'webp',
      height: 1 + buffer.readUIntLE(27, 3),
      width: 1 + buffer.readUIntLE(24, 3),
    };
  }
  if (chunk === 'VP8 ') {
    return {
      format: 'webp',
      height: buffer.readUInt16LE(26) & 0x3fff,
      width: buffer.readUInt16LE(24) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      format: 'webp',
      height: 1 + ((bits >> 14) & 0x3fff),
      width: 1 + (bits & 0x3fff),
    };
  }
  throw new Error(`Unsupported WebP chunk: ${chunk}`);
}

module.exports = { readImageMetadata };
