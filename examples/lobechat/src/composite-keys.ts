// LobeChat declares five composite foreign keys across three tables, and a member of a composite
// tuple cannot be given a structural default: picking each column independently would produce a
// tuple that does not exist in the parent. The library refuses rather than generate a broken row,
// naming the tuple, so these five need rules that keep the members consistent together.
//
// The technique is to fix the shared key values up front and have parent and child draw from the
// same pools. Every expertise row uses one domain, and every goal node one goal, so any child
// tuple built from these pools exists in the parent by construction.
import { constant, derive } from 'drizzle-super-seed';

const DOMAIN_ID = 'domain-alpha';

const GOAL_ID = 'goal-alpha';

const RUN_IDS = [
  '0f8d4a4e-1c1b-4c4a-9a1e-9b4a7c0d1e01',
  '0f8d4a4e-1c1b-4c4a-9a1e-9b4a7c0d1e02',
  '0f8d4a4e-1c1b-4c4a-9a1e-9b4a7c0d1e03',
];

const LESSON_IDS = [
  '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c01',
  '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c02',
  '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c03',
];

const NODE_IDS = [
  '2b3c4d5e-6f7a-4b9c-8d0e-2f3a4b5c6d01',
  '2b3c4d5e-6f7a-4b9c-8d0e-2f3a4b5c6d02',
  '2b3c4d5e-6f7a-4b9c-8d0e-2f3a4b5c6d03',
];

const fromPool = (pool: readonly string[]) => derive((_row, context) => pool[context.rowIndex % pool.length]);

// An edge points at the node after it, so the example produces a real edge rather than a self loop.
const nextInPool = (pool: readonly string[]) => derive((_row, context) => pool[(context.rowIndex + 1) % pool.length]);

export const compositeKeyRules: Record<string, Record<string, unknown>> = {
  expertiseRuns: {
    id: fromPool(RUN_IDS),
    domainId: constant(DOMAIN_ID),
  },
  expertiseLessons: {
    id: fromPool(LESSON_IDS),
    domainId: constant(DOMAIN_ID),
  },
  expertiseDomainSnapshots: {
    runId: fromPool(RUN_IDS),
    domainId: constant(DOMAIN_ID),
  },
  expertiseHits: {
    runId: fromPool(RUN_IDS),
    lessonId: fromPool(LESSON_IDS),
    domainId: constant(DOMAIN_ID),
  },
  goalNodes: {
    id: fromPool(NODE_IDS),
    goalId: constant(GOAL_ID),
  },
  goalEdges: {
    goalId: constant(GOAL_ID),
    sourceNodeId: fromPool(NODE_IDS),
    targetNodeId: nextInPool(NODE_IDS),
  },
};
