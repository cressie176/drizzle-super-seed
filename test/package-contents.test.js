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

describe('package contents', () => {
  it('packages the library, its declarations, the readme and the licence', () => {
    deq(packagedPaths(), ['LICENSE', 'README.md', 'lib/index.d.ts', 'lib/index.js', 'package.json']);
  });
});
