const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { join } = require('node:path');

const ALGORITHM = 'sha256';

const digestOf = async (directory, name) => {
  const hash = createHash(ALGORITHM);
  for await (const chunk of createReadStream(join(directory, name))) hash.update(chunk);
  return hash.digest('hex');
};

// A cache key over the payload files, folded in the manifest's own order and in the shape
// sha256sum prints, so a consumer can recompute it with standard tools rather than taking this
// library's word for it: sha256sum $(files) | sha256sum. The manifest itself is excluded,
// since it carries the answer, and so is the orchestrator, which is derivable from the list.
// The files are read back rather than hashed as they are written: it costs one more pass over
// bytes the generator has already spent far longer producing, and it hashes what actually
// reached the disk.
const contentHashOf = async (directory, files) => {
  const hash = createHash(ALGORITHM);
  for (const name of files) hash.update(`${await digestOf(directory, name)}  ${name}\n`);
  return `${ALGORITHM}:${hash.digest('hex')}`;
};

module.exports = { contentHashOf };
