const ColumnKind = Object.freeze({
  Integer: 'Integer',
  BigInt: 'BigInt',
  Decimal: 'Decimal',
  Real: 'Real',
  Text: 'Text',
  Boolean: 'Boolean',
  Uuid: 'Uuid',
  Date: 'Date',
  Timestamp: 'Timestamp',
  Time: 'Time',
  Json: 'Json',
  Enum: 'Enum',
});

module.exports = { ColumnKind };
