const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const repositoryRoot = join(__dirname, '..', '..');

const connection = {
  host: process.env.PGHOST ?? 'localhost',
  port: process.env.PGPORT ?? '5432',
  user: process.env.PGUSER ?? 'drizzle_super_seed',
  password: process.env.PGPASSWORD ?? 'drizzle_super_seed',
  database: process.env.PGDATABASE ?? 'drizzle_super_seed',
};

const psqlFlags = ['-v', 'ON_ERROR_STOP=1', '--no-psqlrc', '--quiet'];

const installedPsql = () => ({
  command: 'psql',
  args: [
    ...psqlFlags,
    '-h',
    connection.host,
    '-p',
    `${connection.port}`,
    '-U',
    connection.user,
    '-d',
    connection.database,
  ],
  env: { ...process.env, PGPASSWORD: connection.password },
});

const composePsql = () => ({
  command: 'docker',
  args: [
    'compose',
    'exec',
    '-T',
    '-e',
    `PGPASSWORD=${connection.password}`,
    'postgres',
    'psql',
    ...psqlFlags,
    '-U',
    connection.user,
    '-d',
    connection.database,
  ],
  env: process.env,
});

const isPsqlInstalled = () => {
  try {
    execFileSync('psql', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

let chosen;

const psql = () => {
  chosen ??= isPsqlInstalled() ? installedPsql() : composePsql();
  return chosen;
};

const runPsql = (sql) => {
  const { command, args, env } = psql();
  return execFileSync(command, args, { input: sql, env, cwd: repositoryRoot, encoding: 'utf8' });
};

module.exports = { runPsql };
