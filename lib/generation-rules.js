const { ColumnKind } = require('./column-kind');
const {
  MissingColumnRuleError,
  MissingParentCountError,
  MissingTableRulesError,
  NotNullSelfReferenceError,
  UnknownColumnRuleError,
  UnknownCountTableError,
} = require('./generation-errors');
const {
  constant,
  optional,
  pickFrom,
  randomBoolean,
  randomDecimalString,
  randomInteger,
  randomTimestampWithinYears,
  randomUuid,
  randomWords,
  selfReference,
} = require('./value-generators');

const structuralDefault = Symbol('structuralDefault');

const PlanSource = Object.freeze({
  ExplicitRule: 'ExplicitRule',
  Literal: 'Literal',
  StructuralDefault: 'StructuralDefault',
  EngineManaged: 'EngineManaged',
});

const DEFAULT_INTEGER_MAX = 1_000_000;
const DEFAULT_REAL_MAX = 1_000_000;
const DEFAULT_DECIMAL_PRECISION = 10;
const DEFAULT_DECIMAL_SCALE = 2;
const DEFAULT_TEXT_MIN_LENGTH = 8;
const DEFAULT_TEXT_MAX_LENGTH = 32;
const DEFAULT_YEARS = 5;

const lesserOf = (limit, fallback) => (limit === undefined || limit > fallback ? fallback : Number(limit));

const wholeNumber = ({ maxValue }) => randomInteger(0, lesserOf(maxValue, DEFAULT_INTEGER_MAX));

const wholeBigInt = (column) => {
  const whole = wholeNumber(column);
  return (context) => BigInt(whole(context));
};

const realNumber = () => (context) => context.random.next() * DEFAULT_REAL_MAX;

const largestValueOf = (precision, scale) => 10 ** (precision - scale) - 1;

const decimalString = ({ precision = DEFAULT_DECIMAL_PRECISION, scale = DEFAULT_DECIMAL_SCALE }) =>
  randomDecimalString(0, largestValueOf(precision, scale), scale);

const decimalNumber = (column) => {
  const decimal = decimalString(column);
  return (context) => Number(decimal(context));
};

const decimalBigInt = ({ precision = DEFAULT_DECIMAL_PRECISION, scale = DEFAULT_DECIMAL_SCALE }) => {
  const whole = randomInteger(0, largestValueOf(precision, scale));
  return (context) => BigInt(whole(context));
};

const boundedWords = ({ maxLength = DEFAULT_TEXT_MAX_LENGTH }) =>
  randomWords({
    minLength: Math.min(DEFAULT_TEXT_MIN_LENGTH, maxLength),
    maxLength: Math.min(DEFAULT_TEXT_MAX_LENGTH, maxLength),
  });

const eitherBoolean = () => randomBoolean();

const anyUuid = () => randomUuid();

const recentTimestamp = () => randomTimestampWithinYears(DEFAULT_YEARS);

const DATE_LENGTH = 'YYYY-MM-DD'.length;

const recentDateString = () => {
  const timestamp = recentTimestamp();
  return (context) => timestamp(context).toISOString().slice(0, DATE_LENGTH);
};

const recentTimestampString = () => {
  const timestamp = recentTimestamp();
  return (context) => timestamp(context).toISOString();
};

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;

const twoDigits = (value) => String(value).padStart(2, '0');

const timeOfDay = (secondOfDay) =>
  [
    Math.floor(secondOfDay / SECONDS_PER_HOUR),
    Math.floor(secondOfDay / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR,
    secondOfDay % SECONDS_PER_MINUTE,
  ]
    .map(twoDigits)
    .join(':');

const anyTimeOfDay = () => (context) => timeOfDay(context.random.intBetween(0, SECONDS_PER_DAY - 1));

const emptyJson = () => () => ({});

const declaredValue = ({ enumValues }) => pickFrom(enumValues);

const asDeclared = (factories) => (column) => factories[column.jsType](column);

const structuralDefaults = new Map([
  [ColumnKind.Integer, wholeNumber],
  [ColumnKind.BigInt, asDeclared({ number: wholeNumber, bigint: wholeBigInt })],
  [ColumnKind.Decimal, asDeclared({ string: decimalString, number: decimalNumber, bigint: decimalBigInt })],
  [ColumnKind.Real, realNumber],
  [ColumnKind.Text, boundedWords],
  [ColumnKind.Boolean, eitherBoolean],
  [ColumnKind.Uuid, anyUuid],
  [ColumnKind.Date, asDeclared({ string: recentDateString, date: recentTimestamp })],
  [ColumnKind.Timestamp, asDeclared({ date: recentTimestamp, string: recentTimestampString })],
  [ColumnKind.Time, anyTimeOfDay],
  [ColumnKind.Json, emptyJson],
  [ColumnKind.Enum, declaredValue],
]);

const kindDefault = (column) => structuralDefaults.get(column.kind)(column);

const derivedDefault = (column) => (column.notNull ? kindDefault(column) : optional(kindDefault(column)));

const sequenceCounters = {
  number: () => (context) => context.rowIndex + 1,
  bigint: () => (context) => BigInt(context.rowIndex + 1),
};

const sequenceCounter = (column) => sequenceCounters[column.jsType]();

const engineManaged = (generator) => ({ source: PlanSource.EngineManaged, generator });

const parentReference = engineManaged(null);

const foreignKeyOf = (table, column) => table.foreignKeys.find((foreignKey) => foreignKey.columnName === column.name);

const parentTableOf = (table, column) => {
  const foreignKey = foreignKeyOf(table, column);
  if (!foreignKey || foreignKey.referencedTableKey === table.key) return undefined;
  return foreignKey.referencedTableKey;
};

const priorRowReference = (table, column) => {
  if (column.notNull) throw new NotNullSelfReferenceError({ table: table.key, column: column.propertyName });
  return engineManaged(selfReference());
};

const resolveStructurally = (table, column) => {
  const foreignKey = foreignKeyOf(table, column);
  if (foreignKey?.referencedTableKey === table.key) return priorRowReference(table, column);
  if (foreignKey) return parentReference;
  if (column.sequenceOwned) return engineManaged(sequenceCounter(column));
  return { source: PlanSource.StructuralDefault, generator: derivedDefault(column) };
};

const resolveRule = (table, column, rule) => {
  if (rule === structuralDefault) return resolveStructurally(table, column);
  if (typeof rule === 'function') return { source: PlanSource.ExplicitRule, generator: rule };
  return { source: PlanSource.Literal, generator: constant(rule) };
};

const isRuled = (tableRules, column) => tableRules[column.propertyName] !== undefined;

const ruleFor = (tableRules, column) =>
  isRuled(tableRules, column) ? tableRules[column.propertyName] : structuralDefault;

const requireRule = (table, column, tableRules) => {
  if (column.identityAlways || isRuled(tableRules, column)) return;
  throw new MissingColumnRuleError({ table: table.key, column: column.propertyName });
};

const isDeferred = (deferred, table, column) =>
  deferred.some((each) => each.tableKey === table.key && each.columnName === column.name);

const requireParentCount = (table, column, source, counts, deferred) => {
  if (source !== PlanSource.EngineManaged || isDeferred(deferred, table, column)) return;
  const parentTable = parentTableOf(table, column);
  if (parentTable === undefined || Object.hasOwn(counts, parentTable)) return;
  throw new MissingParentCountError({ table: table.key, column: column.propertyName, parentTable });
};

const planColumn = (table, column, tableRules, counts, deferred) => {
  requireRule(table, column, tableRules);
  const { source, generator } = resolveRule(table, column, ruleFor(tableRules, column));
  requireParentCount(table, column, source, counts, deferred);
  return { column, generator, source };
};

const rulesFor = (rules, table) => {
  const tableRules = rules[table.key];
  if (tableRules) return tableRules;
  throw new MissingTableRulesError({ table: table.key });
};

const requireKnownColumns = (table, tableRules) => {
  const columnNames = new Set(table.columns.map((column) => column.propertyName));
  for (const ruleName of Object.keys(tableRules)) {
    if (columnNames.has(ruleName)) continue;
    throw new UnknownColumnRuleError({ table: table.key, column: ruleName });
  }
};

const planTable = (table, rules, counts, deferred) => {
  const tableRules = rulesFor(rules, table);
  requireKnownColumns(table, tableRules);
  return table.columns.map((column) => planColumn(table, column, tableRules, counts, deferred));
};

const requireCountedTablesDeclared = (schema, counts) => {
  for (const table of Object.keys(counts)) {
    if (schema.tables.has(table)) continue;
    throw new UnknownCountTableError({ table });
  }
};

const countedTables = (schema, counts) =>
  [...schema.tables.values()].filter((table) => Object.hasOwn(counts, table.key));

const resolveGenerationPlan = (schema, rules, counts, deferredForeignKeys = []) => {
  requireCountedTablesDeclared(schema, counts);
  return new Map(
    countedTables(schema, counts).map((table) => [table.key, planTable(table, rules, counts, deferredForeignKeys)]),
  );
};

module.exports = { PlanSource, resolveGenerationPlan, structuralDefault };
