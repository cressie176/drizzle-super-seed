// LobeChat declares twelve CHECK constraints across four tables. drizzle's check() is a constraint
// on the table, not a property of the column, so nothing about it reaches the canonical schema and
// structuralDefault cannot honour it: a text column bounded to 'sandbox' or 'production' looks like
// any other text column. Columns under a CHECK therefore need a rule, exactly as the database's own
// error tells you the first time you load without one.
//
// This is the general lesson rather than a LobeChat quirk. The constraints here cover the usual
// shapes: a bounded set, a regular expression, a range, a relationship between two columns, and a
// group of columns that must be all null or all set together.
import { constant, derive, pickFrom, randomDecimalString, randomInteger, randomWords } from 'drizzle-super-seed';

const APNS_ENVIRONMENTS = ['sandbox', 'production'];

const HEX = '0123456789abcdef';
const HASH_LENGTH = 64;

// The constraint is a regular expression, ^[a-f0-9]{64}$, so the value has to be built to match it.
const hexHash = () =>
  derive((_row, context) => Array.from({ length: HASH_LENGTH }, () => context.random.pick(HEX.split(''))).join(''));

const ITEM_COUNT = 5;

// Several constraints say "this column is only allowed when that one is set". The value that
// satisfies every one of them is null, so a nulled optional column is the recurring answer below.
const absent = () => constant(null);

export const checkConstraintRules: Record<string, Record<string, unknown>> = {
  expertiseBindings: {
    // Exactly one carrier of the four may be set, and none of them is a foreign key.
    agentId: randomWords({ minLength: 6, maxLength: 12 }),
    projectId: absent(),
    boundWorkspaceId: absent(),
    boundUserId: absent(),
  },
  goalNodes: {
    confidence: randomDecimalString(0, 1, 3),
    // A task may only hang off a node of kind 'work', and kind is generated freely.
    taskId: absent(),
  },
  projectCompletionReviews: {
    round: randomInteger(1, 5),
  },
  projects: {
    // A completed project must carry both a review and a completion time, so this one stays open.
    status: constant('active'),
    completedReviewId: absent(),
    completedAt: absent(),
  },
  topicComments: {
    // Four interlocking constraints govern anchoring, replies, moderation and deletion. A plain
    // top level comment, anchored to nothing and moderated never, satisfies all four.
    messageId: absent(),
    anchorPreview: absent(),
    parentCommentId: absent(),
    moderatedAt: absent(),
    moderationExpiresAt: absent(),
    deletedAt: absent(),
  },
  verifyReviewPredictions: {
    // An action is present exactly when the status is 'judged'.
    status: pickFrom(['skipped', 'errored']),
    action: absent(),
  },
  verifyRuns: {
    acceptanceId: absent(),
  },
  pushLiveActivities: {
    apnsEnvironment: pickFrom(APNS_ENVIRONMENTS),
  },
  pushTokens: {
    apnsEnvironment: pickFrom(APNS_ENVIRONMENTS),
  },
  agentInterventions: {
    reviewTokenHash: hexHash(),
    requestRevisionHash: hexHash(),
    stepIndex: randomInteger(0, 10),
    // item_index >= 0 AND item_index < item_count, so the pair is fixed together rather than
    // derived from a column whose value depends on generation order.
    itemCount: constant(ITEM_COUNT),
    itemIndex: randomInteger(0, ITEM_COUNT - 1),
    version: randomInteger(1, 5),
  },
  agentInterventionResolutions: {
    expectedItemCount: randomInteger(1, 10),
    version: randomInteger(1, 5),
    // The custom execution columns must be all null or all set to a consistent state. All null is
    // the branch with no further obligations, and it satisfies the parent status check too.
    customExecutionState: constant(null),
    customExecutionInputHash: constant(null),
    customExecutionAttempt: constant(null),
    customExecutionLeaseToken: constant(null),
    customExecutionLeaseExpiresAt: constant(null),
    customExecutionResult: constant(null),
  },
};
