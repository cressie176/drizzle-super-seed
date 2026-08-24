const { describe, it } = require('node:test');
const { deepEqual: deq } = require('node:assert');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const packagedPaths = () => {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const [tarball] = JSON.parse(output);
  return tarball.files.map((file) => file.path).sort();
};

const outsideLib = (path) => !path.startsWith('lib/');

describe('package contents', () => {
  it('packages nothing beyond the library, the readme and the licence', () => {
    deq(packagedPaths().filter(outsideLib), ['LICENSE', 'README.md', 'package.json']);
  });

  it('packages the library entry point and its declarations', () => {
    const packaged = packagedPaths();
    deq(
      ['lib/index.js', 'lib/index.d.ts'].filter((path) => packaged.includes(path)),
      ['lib/index.js', 'lib/index.d.ts'],
    );
  });
});
