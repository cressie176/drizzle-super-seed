const { execFile } = require('node:child_process');
const { join } = require('node:path');

const REPOSITORY_ROOT = join(__dirname, '..', '..');
const MAX_OUTPUT = 16 * 1024 * 1024;

const DATABASE = process.env.PGDATABASE ?? 'drizzle_super_seed';
const USER = process.env.PGUSER ?? 'drizzle_super_seed';

const composeArguments = (psqlArguments) => [
  'compose',
  'exec',
  '-T',
  'postgres',
  'psql',
  '-v',
  'ON_ERROR_STOP=1',
  '-U',
  USER,
  ...psqlArguments,
];

const failure = (error, stderr) => Object.assign(error, { message: `${error.message}\n${stderr}` });

const runPsql = (psqlArguments, stdin) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'docker',
      composeArguments(psqlArguments),
      { cwd: REPOSITORY_ROOT, maxBuffer: MAX_OUTPUT },
      (error, stdout, stderr) => (error ? reject(failure(error, stderr)) : resolve(stdout)),
    );
    child.stdin.end(stdin ?? '');
  });

const executeScript = (script) => runPsql(['-d', DATABASE], script);

module.exports = { executeScript };
