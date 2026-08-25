const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const mysql = require('mysql2/promise');

const ddl = readFileSync(join(__dirname, 'park-schema-mariadb.sql'), 'utf8');

const TABLE_NAMES = ['lettings', 'accessories', 'holiday_homes', 'pitches', 'park_owners', 'owners', 'parks'];

const connect = () =>
  mysql.createConnection({
    host: process.env.MARIADB_HOST ?? 'localhost',
    port: Number(process.env.MARIADB_PORT ?? 3306),
    user: process.env.MARIADB_USER ?? 'drizzle_super_seed',
    password: process.env.MARIADB_PASSWORD ?? 'drizzle_super_seed',
    database: process.env.MARIADB_DATABASE ?? 'drizzle_super_seed',
    multipleStatements: true,
  });

const createParkSchema = (connection) => connection.query(ddl);

const dropParkSchema = async (connection) => {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query(`DROP TABLE IF EXISTS ${TABLE_NAMES.join(', ')}`);
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
};

const { execFile } = require('node:child_process');

const REPOSITORY_ROOT = join(__dirname, '..', '..');
const MAX_OUTPUT = 16 * 1024 * 1024;

const USER = process.env.MARIADB_USER ?? 'drizzle_super_seed';
const PASSWORD = process.env.MARIADB_PASSWORD ?? 'drizzle_super_seed';
const DATABASE = process.env.MARIADB_DATABASE ?? 'drizzle_super_seed';

const dockerCompose = (dockerArguments, stdin) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'docker',
      ['compose', ...dockerArguments],
      { cwd: REPOSITORY_ROOT, maxBuffer: MAX_OUTPUT },
      (error, stdout, stderr) =>
        error ? reject(Object.assign(error, { message: `${error.message}\n${stderr}` })) : resolve(stdout),
    );
    child.stdin.end(stdin ?? '');
  });

const inContainer = (containerArguments) => ['exec', '-T', 'mariadb', ...containerArguments];

const mariadbArguments = (given) => ['mariadb', `-u${USER}`, `-p${PASSWORD}`, ...given];

const executeScript = (script) => dockerCompose(inContainer(mariadbArguments([DATABASE])), script);

const executeFile = (path) =>
  dockerCompose(inContainer(['sh', '-c', `mariadb -u${USER} -p${PASSWORD} ${DATABASE} < ${path}`]));

const sourceOrchestrator = (directory, file) =>
  dockerCompose(
    inContainer(['sh', '-c', `cd ${directory} && mariadb -u${USER} -p${PASSWORD} ${DATABASE} -e 'source ${file}'`]),
  );

const queryValue = async (statement) =>
  (await dockerCompose(inContainer(mariadbArguments(['-N', '-B', '-e', statement, DATABASE])))).trim().split('\n')[0];

const stageDirectory = async (source, destination) => {
  await dockerCompose(inContainer(['rm', '-rf', destination]));
  await dockerCompose(['cp', source, `mariadb:${destination}`]);
  return destination;
};

const removeStaged = (path) => dockerCompose(inContainer(['rm', '-rf', path]));

module.exports = {
  TABLE_NAMES,
  connect,
  createParkSchema,
  dropParkSchema,
  executeFile,
  executeScript,
  queryValue,
  removeStaged,
  sourceOrchestrator,
  stageDirectory,
};
