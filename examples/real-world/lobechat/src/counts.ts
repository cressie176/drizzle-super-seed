// Small and uniform: this example exists to prove a 165 table schema extracts, generates and loads,
// not to produce a realistic LobeChat.
export const ROWS_PER_TABLE = 3;

export const SEED = 44;

export const countsFor = (tableKeys: Iterable<string>): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const key of tableKeys) counts[key] = ROWS_PER_TABLE;
  return counts;
};
