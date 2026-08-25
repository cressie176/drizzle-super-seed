import { execFile } from 'node:child_process';
import { readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// The DDL comes from the drizzle schema itself: drizzle-kit generate diffs the schema module
// against an empty journal and emits plain SQL. The output directory is cleared first, because
// generate appends a new migration to whatever journal it finds.
export const generateMigrations = async (config: string): Promise<string> => {
  const out = join(packageRoot, 'drizzle', config.replace('drizzle-', '').replace('.config.ts', ''));
  await rm(out, { recursive: true, force: true });
  await run('npx', ['drizzle-kit', 'generate', `--config=${config}`], { cwd: packageRoot });
  return out;
};

// drizzle-kit separates statements with a `--> statement-breakpoint` line, which is a SQL comment
// to PostgreSQL and SQLite but not to MySQL (`--` needs trailing whitespace there), so files are
// split into statements rather than executed whole.
export const migrationStatements = async (directory: string): Promise<string[]> => {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  const statements: string[] = [];
  for (const file of files) {
    const content = await readFile(join(directory, file), 'utf8');
    statements.push(
      ...content
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter(Boolean),
    );
  }
  return statements;
};
