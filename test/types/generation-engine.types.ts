import {
  type CanonicalTable,
  type CountRule,
  type GenerationReport,
  type GenerationSink,
  type SchemaRules,
  constant,
  derive,
  generate,
  structuralDefault,
} from '../../lib/index';
import * as schema from './park-schema';

const rules = {
  parks: {
    name: structuralDefault,
    region: structuralDefault,
    openedAt: structuralDefault,
    latitude: structuralDefault,
    amenities: structuralDefault,
    active: structuralDefault,
    createdAt: derive((_row, context) => new Date(context.referenceDate)),
  },
  pitches: {
    id: structuralDefault,
    parkId: structuralDefault,
    reference: structuralDefault,
    areaSqm: structuralDefault,
    hasElectricity: structuralDefault,
  },
} satisfies SchemaRules<typeof schema>;

const counts = { parks: 3, pitches: 5 };

const perParentCounts: Record<string, CountRule> = {
  parks: 3,
  pitches: { per: 'parks', count: constant(4), retain: ['openedAt'] },
};

const perParentCountOfTheWrongType: Record<string, CountRule> = {
  parks: 3,
  // @ts-expect-error a per parent count must be a generator, not a number
  pitches: { per: 'parks', count: 4 },
};

const countingSink: GenerationSink<number> = {
  beginTable: (table: CanonicalTable) => void table.key,
  writeRows: async (_table, rows) => void rows.length,
  endTable: () => {},
  end: (report: GenerationReport) => report.rowCounts.parks,
};

const parkCount: Promise<number> = generate({ schema, rules, counts }, countingSink);

const reportingSink = {
  writeRows: () => {},
  end: (report: GenerationReport) => report,
};

const report: Promise<GenerationReport> = generate({ schema, rules, counts, seed: 42 }, reportingSink);

const perParent: Promise<GenerationReport> = generate(
  { schema, rules, counts: perParentCounts, seed: 42 },
  reportingSink,
);

const overridden: Promise<GenerationReport> = generate(
  { schema, rules, counts, overrides: { parks: [{ region: 'south-west' }, { id: 7 }] } },
  reportingSink,
);

const configured: Promise<GenerationReport> = generate(
  {
    schema,
    rules,
    counts,
    seed: 42,
    referenceDate: new Date('2024-06-01'),
    batchSize: 500,
    lookups: { postcodes: async () => ['TR8 4LW'] },
  },
  reportingSink,
);

const rulesMissingATable = generate(
  // @ts-expect-error a rules record missing a table does not satisfy the config
  { schema, rules: { parks: rules.parks }, counts },
  reportingSink,
);

const countOfTheWrongType = generate(
  // @ts-expect-error a count must be a number
  { schema, rules, counts: { parks: 'three' } },
  reportingSink,
);

const sinkWithoutWriteRows = generate(
  { schema, rules, counts },
  // @ts-expect-error a sink must implement writeRows
  { end: (finished: GenerationReport) => finished },
);

export {
  configured,
  countOfTheWrongType,
  overridden,
  parkCount,
  perParent,
  perParentCountOfTheWrongType,
  report,
  rulesMissingATable,
  sinkWithoutWriteRows,
};
