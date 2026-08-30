// Generates src/rules.ts and src/counts.ts from the canonical model: a structuralDefaults
// skeleton per table, with overrides produced by classifying each check-constrained column's
// predicate - at 372 tables the classifier is the only honest alternative to 700-odd hand
// rules, because MusicBrainz's predicates cluster into about a dozen shapes. Unclassifiable
// columns are printed and fail the build, so a schema refresh cannot silently guess.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CanonicalColumn, ColumnKind, extractCanonicalSchema } from 'drizzle-super-seed';
import * as schema from '../src/schema.ts';

const canonical = extractCanonicalSchema(schema);

// tableKey.propertyName -> TS expression. The oddballs judgment cannot be scripted for.
const handMap: Record<string, string> = {
  // tag_relation_check orders a pair of foreign keys the check-refusal exempts: row numbers
  // keep the pair valid and strictly ascending
  'tagRelationInMusicbrainz.tag1': 'atLeast(1)',
  'tagRelationInMusicbrainz.tag2': 'atLeast(2)',
  // the partitions are LIST (is_track_artist): rows must respect their partition's bound
  'artistReleaseNonvaInMusicbrainz.isTrackArtist': 'false',
  'artistReleaseVaInMusicbrainz.isTrackArtist': 'true',
  'artistReleaseGroupNonvaInMusicbrainz.isTrackArtist': 'false',
  'artistReleaseGroupVaInMusicbrainz.isTrackArtist': 'true',
  // the only NOT NULL self-reference: a root attribute is its own root, and serial ids are
  // engine-numbered densely from 1, so the row number is the row's own id
  'linkAttributeTypeInMusicbrainz.root': 'atLeast(1)',
  // cube via the customType contract: text form of a one-dimensional cube
  'mediumIndexInMusicbrainz.toc': `'(1, 2, 3, 4, 5, 6)'`,
  // artist rows must survive artist_va_check/artist_dl_check: id 1 is pinned to type 3 with
  // every optional association null, and the cheapest global rule is to hold them null throughout
  'artistInMusicbrainz.type': 'derive((_r, c) => (c.rowIndex === 0 ? 3 : c.random.intBetween(1, 5)))',
  'artistInMusicbrainz.gender': 'null',
  'artistInMusicbrainz.area': 'null',
  'artistInMusicbrainz.beginArea': 'null',
  'artistInMusicbrainz.endArea': 'null',
  'editorOauthTokenInMusicbrainz.codeChallenge': 'null',
  'editorOauthTokenInMusicbrainz.codeChallengeMethod': 'null',
  'languageInMusicbrainz.isoCode2T': 'null',
  'languageInMusicbrainz.isoCode2B': 'null',
  'languageInMusicbrainz.isoCode1': 'null',
  'languageInMusicbrainz.isoCode3': 'sequence((i) => base26(i, 3))',
  'artistIpiInMusicbrainz.ipi': 'sequence((i) => String(10000000000 + i))',
  'labelIpiInMusicbrainz.ipi': 'sequence((i) => String(10000000000 + i))',
  'artistIsniInMusicbrainz.isni': 'sequence((i) => String(1000000000000000 + i))',
  'labelIsniInMusicbrainz.isni': 'sequence((i) => String(1000000000000000 + i))',
  'iswcInMusicbrainz.iswc': 'sequence((i) => iswcCode(i))',
  'isrcInMusicbrainz.isrc': `sequence((i) => \`USAAA\${String(i + 1).padStart(7, '0')}\`)`,
  'labelInMusicbrainz.labelCode': 'randomInteger(1, 999999)',
  'urlInMusicbrainz.url': 'sequence((i) => `https://example.com/page-${i + 1}`)',
};

const DATE_PART = /^(begin|end)Date(Year|Month|Day)$/;

const esc = (value: string) => value.replace(/'/g, "\\'");

const parseAnyList = (predicate: string): string | null => {
  const match = predicate.match(/= ANY \(+ARRAY\[([^\]]+)\]/);
  if (!match) return null;
  const items = match[1].split(',').map((raw) => {
    const item = raw.trim();
    const quoted = item.match(/^'([^']*)'/);
    if (quoted) return /^-?\d+$/.test(quoted[1]) ? quoted[1] : `'${esc(quoted[1])}'`;
    return item.replace(/::[a-z_ ]+/g, '');
  });
  return `pickFrom([${items.join(', ')}])`;
};

const unclassified: string[] = [];

const classify = (tableKey: string, column: CanonicalColumn, predicate: string, hasName: boolean): string | null => {
  const key = `${tableKey}.${column.propertyName}`;
  if (handMap[key]) return handMap[key];
  if (DATE_PART.test(column.propertyName)) return 'null';
  if (column.propertyName === 'ended') return 'false';
  if (column.propertyName === 'locale') return 'null';
  if (column.propertyName === 'primaryForLocale') return 'false';
  if (column.propertyName === 'sortName' && hasName) return 'sameAsName';
  if (/_allowed_value IS NULL\) AND \(\w+_text IS NOT NULL/.test(predicate))
    return 'randomWords({ minLength: 3, maxLength: 30 })';
  if (column.propertyName === 'name' && /sort_name\)::text = \(name\)::text/.test(predicate))
    return 'randomWords({ minLength: 3, maxLength: 30 })';
  const anyList = parseAnyList(predicate);
  if (anyList) return anyList;
  let match = predicate.match(/\(\w+ >= (-?\d+)\) AND \(\w+ <= (-?\d+)\)/);
  if (match) return `randomInteger(${match[1]}, ${match[2]})`;
  match = predicate.match(/\(\w+ > (-?\d+)\) AND \(\w+ < (-?\d+)\)/);
  if (match) return `randomInteger(${Number(match[1]) + 1}, ${Number(match[2]) - 1})`;
  match = predicate.match(/\(\w+ IS NULL\) OR \(\w+ > (-?\d+)\)/);
  if (match) return `randomInteger(${Number(match[1]) + 1}, ${Number(match[1]) + 100000})`;
  match = predicate.match(/\(\w+ = (-?\d+)\) OR \(\w+ = (-?\d+)\)/);
  if (match) return `pickFrom([${match[1]}, ${match[2]}])`;
  match = predicate.match(/^"?\w+"? >= (-?\d+)$/);
  if (match) return `atLeast(${match[1]})`;
  // at-least-one over a date triple: the year carries it, the parts stay null
  if (/\(date_year IS NOT NULL\) OR \(date_month IS NOT NULL\) OR \(date_day IS NOT NULL\)/.test(predicate)) {
    if (column.propertyName === 'dateYear') return 'randomInteger(1950, 2020)';
    return 'null';
  }
  if (/controlled_for_whitespace|<> ''/.test(predicate)) {
    const cap = column.maxLength ? Math.min(column.maxLength, 30) : 30;
    return `randomWords({ minLength: 3, maxLength: ${cap} })`;
  }
  unclassified.push(`${key}\t${predicate}`);
  return null;
};

const lines: string[] = [];
const countLines: string[] = [];

// counts: entities get pools worth referencing, lookups stay small, everything else modest
const bigTables = new Set([
  'artistInMusicbrainz',
  'releaseInMusicbrainz',
  'recordingInMusicbrainz',
  'releaseGroupInMusicbrainz',
  'workInMusicbrainz',
  'labelInMusicbrainz',
  'placeInMusicbrainz',
  'eventInMusicbrainz',
  'areaInMusicbrainz',
  'seriesInMusicbrainz',
  'urlInMusicbrainz',
  'trackInMusicbrainz',
  'mediumInMusicbrainz',
  'editorInMusicbrainz',
  'editInMusicbrainz',
  'artistCreditInMusicbrainz',
  'genreInMusicbrainz',
  'instrumentInMusicbrainz',
  'moodInMusicbrainz',
]);
const BIG = 100;
const DEFAULT_COUNT = 20;
const countFor = (key: string) =>
  // tag2 climbs to rowIndex + 2, which must stay inside tag's 20-row pool
  key === 'tagRelationInMusicbrainz'
    ? 18
    : bigTables.has(key)
      ? BIG
      : /Type|gender|script|language/i.test(key)
        ? 5
        : DEFAULT_COUNT;

for (const table of canonical.tables.values()) {
  const fkColumns = new Set(table.foreignKeys.map((fk) => fk.columnName));
  const hasName = table.columns.some((c) => c.propertyName === 'name');
  const overrides = new Map<string, string>();

  for (const column of table.columns) {
    const key = `${table.key}.${column.propertyName}`;
    if (handMap[key]) {
      overrides.set(column.propertyName, handMap[key]);
      continue;
    }
    if (fkColumns.has(column.name) || column.sequenceOwned) continue;
    if (column.kind === ColumnKind.Custom) {
      unclassified.push(`${key}\tCUSTOM`);
      continue;
    }
    const constraints = table.checkConstraints.filter((c) => c.columns.includes(column.name));
    if (!constraints.length) continue;
    const predicate = constraints
      .map((c) => c.predicate)
      .join(' && ')
      .replace(/\s+/g, ' ');
    const rule = classify(table.key, column, predicate, hasName);
    if (rule) overrides.set(column.propertyName, rule);
  }

  // exactly-one-of pairs: the allowed_value side is a foreign key the classifier never visits,
  // pin it null so the ruled text side carries the constraint
  for (const constraint of table.checkConstraints) {
    const pair = constraint.predicate
      .replace(/\s+/g, ' ')
      .match(/\(\((\w+_allowed_value) IS NULL\) AND \((\w+_text) IS NOT NULL\)\)/);
    if (!pair) continue;
    const fkProperty = table.columns.find((c) => c.name === pair[1])?.propertyName;
    const textProperty = table.columns.find((c) => c.name === pair[2])?.propertyName;
    if (fkProperty) overrides.set(fkProperty, 'null');
    if (textProperty && !overrides.has(textProperty))
      overrides.set(textProperty, 'randomWords({ minLength: 3, maxLength: 30 })');
  }

  // non_loop_relationship: entity0 <> entity1 over two foreign key columns the check-refusal
  // exempts, so random parent picks can collide. Disjoint row numbers keep the pairs valid,
  // unequal and distinct, on the AdventureWorks row-number pattern.
  if (table.checkConstraints.some((c) => /entity0 <> entity1/.test(c.predicate))) {
    overrides.set('entity0', 'atLeast(1)');
    overrides.set('entity1', 'atLeast(2)');
  }

  // single-column unique indexes over plain text invite retry exhaustion under random words:
  // a sequence-derived value is unique by construction
  const uniquenessSources = [...table.uniqueConstraints, { columns: table.primaryKey }];
  for (const unique of uniquenessSources) {
    if (unique.columns.length !== 1) continue;
    const column = table.columns.find((c) => c.name === unique.columns[0]);
    if (!column || column.kind !== ColumnKind.Text || fkColumns.has(column.name)) continue;
    if (overrides.has(column.propertyName) && overrides.get(column.propertyName) !== 'sameAsName') continue;
    overrides.set(
      column.propertyName,
      column.maxLength && column.maxLength < 12
        ? `sequence((i) => base26(i, ${column.maxLength}))`
        : `uniqueText('${column.propertyName}')`,
    );
  }

  // sameAsName placeholders resolve after unique handling so a unique name wins first
  for (const [property, rule] of overrides) {
    if (rule === 'sameAsName') overrides.set(property, 'derive((row) => String(row.name))');
  }

  const body = [...overrides].map(([property, rule]) => `    ${property}: ${rule},`).join('\n');
  lines.push(`  ${table.key}: {\n    [structuralDefaults]: true,\n${body}${body ? '\n' : ''}  },`);
  countLines.push(`  ${table.key}: ${countFor(table.key)},`);
}

if (unclassified.length) {
  console.error(`UNCLASSIFIED (${unclassified.length}):`);
  for (const line of unclassified) console.error(`  ${line}`);
  process.exit(1);
}

const header = `// Generated by scripts/build-rules.ts: a structuralDefaults skeleton for all ${canonical.tables.size}
// tables, with overrides wherever a check constraint, unique text column or special row
// demands judgment. Regenerate rather than edit.
import {
  type SchemaRules,
  derive,
  pickFrom,
  randomInteger,
  randomWords,
  sequence,
  structuralDefaults,
} from 'drizzle-super-seed';
import type * as schema from './schema.ts';

const atLeast = (minimum: number) => derive((_row, context) => context.rowIndex + minimum);

const uniqueText = (label: string) => sequence((i) => \`\${label} \${i + 1}\`);

const base26 = (value: number, width: number) => {
  let rest = value;
  let out = '';
  for (let i = 0; i < width; i++) { out = String.fromCharCode(97 + (rest % 26)) + out; rest = Math.floor(rest / 26); }
  return out;
};

const iswcCode = (index: number) => {
  const digits = String(index + 1).padStart(9, '0');
  return \`T-\${digits.slice(0, 3)}.\${digits.slice(3, 6)}.\${digits.slice(6, 9)}-0\`;
};

export const rules = {
`;

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
writeFileSync(join(src, 'rules.ts'), `${header}${lines.join('\n')}\n} satisfies SchemaRules<typeof schema>;\n`);
writeFileSync(
  join(src, 'counts.ts'),
  `// Generated by scripts/build-rules.ts alongside rules.ts.\nexport const counts: Record<string, number> = {\n${countLines.join('\n')}\n};\n`,
);
console.log(`rules for ${canonical.tables.size} tables written`);
