const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, ok } = require('node:assert');
const { execFile } = require('node:child_process');
const { mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { promisify } = require('node:util');

const run = promisify(execFile);

const REPOSITORY_ROOT = join(__dirname, '..');
const EXAMPLE = join(REPOSITORY_ROOT, 'examples', 'readme');
const BLOCKS = join(EXAMPLE, 'blocks');

const FENCE = /(?:<!-- readme-test: (?<directive>[a-z-]+) -->\n)?```(?<language>\w*)\n(?<body>[\s\S]*?)```/g;

const IMPORT = /^import[\s\S]*?;$/gm;

const PREAMBLE = `import type { PgTable } from 'drizzle-orm/pg-core';
import { customType, integer, pgTable, text } from 'drizzle-orm/pg-core';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type {
  CanonicalTable,
  CountRule,
  DataGraph,
  GenerationReport,
  GenerationSink,
  RowBatch,
  SchemaRules,
  TableRules,
  ValueGenerator,
} from 'drizzle-super-seed';
import {
  IdentifierCasing,
  TriggerHandling,
  constant,
  createCsvFileSink,
  createInMemoryGraphSink,
  createMariaDbSqlFileSink,
  createPostgresSqlFileSink,
  createPostgresSqlStreamSink,
  createRowBatchSink,
  derive,
  generate,
  normalInteger,
  optional,
  pickFrom,
  randomBoolean,
  randomDateBetween,
  randomDecimalString,
  randomInteger,
  randomTimestampWithinYears,
  randomUuid,
  randomWords,
  selfReference,
  sequence,
  structuralDefault,
  unique,
  unseeded,
  weightedPick,
  weightedPickFrom,
  zipfInteger,
} from 'drizzle-super-seed';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

// Bindings the README's excerpts assume from their surrounding prose.
declare const counts: Record<string, CountRule>;
declare const productionCounts: Record<string, CountRule>;
declare const overrides: Record<string, Array<Record<string, unknown>>>;
declare const seed: number;
declare const report: GenerationReport;
declare const batch: RowBatch;
declare const invoice: { total: string; lines: unknown[] };
declare const out: { write(line: string): void };
declare const structuralParkRules: typeof rules.parks;
declare const pitchRules: typeof rules.pitches;
declare const ownerRules: typeof rules.owners;
declare const holidayHomeRules: typeof rules.holidayHomes;
declare const lettingRules: typeof rules.lettings;
declare function insertBatch(batch: RowBatch): Promise<void>;
declare function loadPostcodeSample(): Promise<string[]>;
declare function parkName(): ValueGenerator<string>;
declare function addDays(date: Date, days: number): Date;
declare function drizzle(config: { client: unknown }): {
  insert(table: SQLiteTable): { values(rows: Record<string, unknown>[]): { run(): void } };
};
declare function buildInvoice(lettings: Record<string, unknown>[]): { total: string; lines: unknown[] };
declare const assert: { equal(actual: unknown, expected: unknown): void };
declare function test(name: string, body: () => Promise<void> | void): void;
declare function spawn(command: string, args: string[], options: unknown): { stdin: NodeJS.WritableStream; on(event: string, listener: (code: number) => void): void };
declare const data: DataGraph;
declare const connectionString: string;
declare const LettingStatus: { Cancelled: 'cancelled'; Confirmed: 'confirmed' };
declare const db: {
  insert(table: PgTable): {
    values(rows: Record<string, unknown>[]): Promise<unknown>;
    overridingSystemValue(): { values(rows: Record<string, unknown>[]): Promise<unknown> };
  };
};
`;

const LOCAL_IMPORT = /^import[^;]*from '(?:\.[^']*|node:[^']*|drizzle-orm[^']*)';$/gm;

const codeBlocks = (markdown) => [...markdown.matchAll(FENCE)].map(({ groups }, index) => ({ index, ...groups }));

// Relative imports name the reader's own schema and rules modules; the preamble supplies both.
const hoisted = (body) => {
  const withoutLocal = body.replace(LOCAL_IMPORT, '');
  const imports = (withoutLocal.match(IMPORT) ?? []).filter((each) => !each.includes("from 'drizzle-super-seed'"));
  const remainder = withoutLocal.replace(IMPORT, '').replace(/^export /gm, '');
  return { imports: imports.join('\n'), remainder };
};

// Each block becomes a module: its imports hoisted, the rest inside a function whose scope may
// shadow the declared bindings, so a block which opens `const data = ...` still compiles.
const compilable = ({ index, body }) => {
  const { imports, remainder } = hoisted(body);
  return `${PREAMBLE}${imports}\n\nexport async function block${index}() {\n${remainder}\n}\n`;
};

const BLOCK_TSCONFIG = {
  extends: '../tsconfig.json',
  compilerOptions: { noEmit: true, noUnusedLocals: false },
  include: ['*.ts'],
};

const typecheck = () =>
  run('npx', ['tsc', '-p', join(BLOCKS, 'tsconfig.json')], { cwd: EXAMPLE, maxBuffer: 8 * 1024 * 1024 })
    .then(() => ({ code: 0, output: '' }))
    .catch((error) => ({ code: error.code, output: error.stdout ?? '' }));

// Table cells use no backticks (house style), so error names are matched bare wherever they appear.
const ERROR_NAME = /\b([A-Z]\w*Error)\b/g;

const documentedErrorNames = (markdown) => new Set([...markdown.matchAll(ERROR_NAME)].map(([, name]) => name));

// generation-errors.js is module-private, but a doc test is in the same category as the module's
// own test file: it is the only place which can see the whole list.
const exportedErrorNames = () =>
  Object.keys(require('../lib/generation-errors')).filter((name) => name !== 'GenerationError');

describe('the readme error table', () => {
  let documented;

  before(async () => {
    documented = documentedErrorNames(await readFile(join(REPOSITORY_ROOT, 'README.md'), 'utf8'));
  });

  it('documents every error the library can throw', () => {
    const undocumented = exportedErrorNames().filter((name) => !documented.has(name));

    deq(undocumented, [], `missing from the readme: ${undocumented.join(', ')}`);
  });

  it('documents no error the library cannot throw', () => {
    const exported = new Set([...exportedErrorNames(), 'GenerationError']);
    const stale = [...documented].filter((name) => !exported.has(name));

    deq(stale, [], `named in the readme but not exported: ${stale.join(', ')}`);
  });
});

describe('the readme', () => {
  let blocks;

  before(async () => {
    blocks = codeBlocks(await readFile(join(REPOSITORY_ROOT, 'README.md'), 'utf8'));
    await rm(BLOCKS, { recursive: true, force: true });
    await mkdir(BLOCKS, { recursive: true });
    for (const block of blocks.filter((each) => each.language === 'ts' && each.directive !== 'skip')) {
      await writeFile(join(BLOCKS, `block-${block.index}.ts`), compilable(block));
    }
    await writeFile(join(BLOCKS, 'tsconfig.json'), JSON.stringify(BLOCK_TSCONFIG, null, 2));
  });

  after(async () => {
    await rm(BLOCKS, { recursive: true, force: true });
  });

  it('has typescript blocks to check', () => {
    ok(blocks.filter((block) => block.language === 'ts').length > 10);
  });

  it('compiles every typescript block against the published types', async () => {
    const { code, output } = await typecheck();

    eq(code, 0, output);
  });

  it('marks the blocks it deliberately leaves unchecked', () => {
    const skipped = blocks.filter((block) => block.directive === 'skip');

    for (const block of skipped) ok(block.language === 'ts', `a skip directive on a ${block.language} block`);
  });
});
