const UINT32_RANGE = 0x100000000;
const MULBERRY32_INCREMENT = 0x6d2b79f5;

const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + MULBERRY32_INCREMENT) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
};

const UUID_BYTES = 16;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;
const UUID_GROUPS = [
  [0, 4],
  [4, 6],
  [6, 8],
  [8, 10],
  [10, 16],
];

const asVersionFour = (byte) => (byte & 0x0f) | 0x40;

const asVariantOne = (byte) => (byte & 0x3f) | 0x80;

const hex = (byte) => byte.toString(16).padStart(2, '0');

const uuidBytes = (next) => {
  const bytes = Array.from({ length: UUID_BYTES }, () => Math.floor(next() * 256));
  bytes[VERSION_BYTE] = asVersionFour(bytes[VERSION_BYTE]);
  bytes[VARIANT_BYTE] = asVariantOne(bytes[VARIANT_BYTE]);
  return bytes;
};

const formatUuid = (bytes) => UUID_GROUPS.map(([from, to]) => bytes.slice(from, to).map(hex).join('')).join('-');

const createRandomSource = (seed) => {
  const next = mulberry32(seed);
  const intBetween = (min, max) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    intBetween,
    chance: (probability) => next() < probability,
    pick: (items) => items[intBetween(0, items.length - 1)],
    uuid: () => formatUuid(uuidBytes(next)),
  };
};

module.exports = { createRandomSource };
