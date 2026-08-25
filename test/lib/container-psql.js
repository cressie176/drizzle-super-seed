const { execFile, spawn } = require('node:child_process');
const { join } = require('node:path');

const REPOSITORY_ROOT = join(__dirname, '..', '..');
const MAX_OUTPUT = 16 * 1024 * 1024;

const DATABASE = process.env.PGDATABASE ?? 'drizzle_super_seed';
const USER = process.env.PGUSER ?? 'drizzle_super_seed';

const failure = (error, stderr) => Object.assign(error, { message: `${error.message}\n${stderr}` });

const dockerCompose = (dockerArguments, stdin) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'docker',
      ['compose', ...dockerArguments],
      { cwd: REPOSITORY_ROOT, maxBuffer: MAX_OUTPUT },
      (error, stdout, stderr) => (error ? reject(failure(error, stderr)) : resolve(stdout)),
    );
    child.stdin.end(stdin ?? '');
  });

const psql = (psqlArguments, stdin) =>
  dockerCompose(['exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', ...psqlArguments], stdin);

const executeScript = (script, { database = DATABASE, user = USER } = {}) => psql(['-U', user, '-d', database], script);

const executeFile = (path, { database = DATABASE, user = USER } = {}) => psql(['-U', user, '-d', database, '-f', path]);

const executeConnectionString = (connectionString, path) => psql([connectionString, '-f', path]);

// psql prints the command tag (INSERT 0 1) after the rows, so only the first line is the value.
const queryValue = async (statement, { database = DATABASE, user = USER } = {}) =>
  (await psql(['-t', '-A', '-U', user, '-d', database, '-c', statement])).trim().split('\n')[0];

const spawnPsql = ({ database = DATABASE, user = USER } = {}) =>
  spawn('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database], {
    cwd: REPOSITORY_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

const copyIntoContainer = (source, destination) => dockerCompose(['cp', source, `postgres:${destination}`]);

const removeFromContainer = (path) => dockerCompose(['exec', '-T', 'postgres', 'rm', '-rf', path]);

const renameInContainer = (from, to) => dockerCompose(['exec', '-T', 'postgres', 'mv', from, to]);

module.exports = {
  copyIntoContainer,
  executeConnectionString,
  executeFile,
  executeScript,
  queryValue,
  removeFromContainer,
  renameInContainer,
  spawnPsql,
};
