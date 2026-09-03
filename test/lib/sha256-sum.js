const { createHash } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Deliberately independent of lib/output-content-hash.js: this is the sha256sum | sha256sum
// recipe the README gives a consumer, so a manifest checked against it is checked against the
// documented contract rather than against the implementation which wrote it.
const sha256Sum = async (directory, files) => {
  const lines = [];
  for (const file of files) lines.push(`${digest(await readFile(join(directory, file)))}  ${file}\n`);
  return `sha256:${digest(lines.join(''))}`;
};

module.exports = { sha256Sum };
