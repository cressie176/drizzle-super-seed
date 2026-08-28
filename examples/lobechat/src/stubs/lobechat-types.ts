// Stands in for @lobechat/types, which is not published. The schema modules take about ninety names
// from it, but all bar two are type only, used in .$type<>() annotations that tsx erases and that
// nothing here needs to resolve; a consumer with the real package installed would need no stub at
// all. These two are the runtime values, both $defaultFn inputs.
import { z } from 'zod';

export const AgentChatConfigSchema = z.object({}).passthrough();

export const EvalEvaluationStatus = Object.freeze({
  Error: 'error',
  Pending: 'pending',
  Success: 'success',
});
