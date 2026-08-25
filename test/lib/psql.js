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

const inContainer = (containerArguments) => ['exec', '-T', 'postgres', ...containerArguments];

const psqlArguments = (given) => ['psql', '-v', 'ON_ERROR_STOP=1', ...given];

const psql = (given, stdin) => dockerCompose(inContainer(psqlArguments(given)), stdin);

const executeScript = (script, { database = DATABASE, user = USER } = {}) => psql(['-U', user, '-d', database], script);

const executeFile = (path, { database = DATABASE, user = USER } = {}) => psql(['-U', user, '-d', database, '-f', path]);

const executeConnectionString = (connectionString, path) => psql([connectionString, '-f', path]);

// psql prints the command tag (INSERT 0 1) after the rows, so only the first line is the value.
const queryValue = async (statement, { database = DATABASE, user = USER } = {}) =>
  (await psql(['-t', '-A', '-U', user, '-d', database, '-c', statement])).trim().split('\n')[0];

const spawnPsql = ({ database = DATABASE, user = USER } = {}) =>
  spawn('docker', ['compose', ...inContainer(psqlArguments(['-U', user, '-d', database]))], {
    cwd: REPOSITORY_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

// psql runs inside the compose container, so generated files have to be copied in before it can
// read them; the returned path is the one psql should be given.
const stageDirectory = async (source, destination) => {
  await removeStaged(destination);
  await dockerCompose(['cp', source, `postgres:${destination}`]);
  return destination;
};

const moveStaged = async (from, to) => {
  await removeStaged(to);
  await dockerCompose(inContainer(['mv', from, to]));
  return to;
};

function removeStaged(path) {
  return dockerCompose(inContainer(['rm', '-rf', path]));
}

const connectionStringFor = (user, database) => `postgresql://${user}:${user}@localhost:5432/${database}`;

module.exports = {
  connectionStringFor,
  executeConnectionString,
  executeFile,
  executeScript,
  moveStaged,
  queryValue,
  removeStaged,
  spawnPsql,
  stageDirectory,
};
