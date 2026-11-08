export const DEFAULT_STEP_LIMIT = 10;
export const MAX_STEP_LIMIT = 60;

/** Only tools actually used in this run can extend its budget; host bounds always apply. */
export function stepBudget(usedTools: Iterable<string>, toolLimits: ReadonlyMap<string, number>): number {
  let limit = DEFAULT_STEP_LIMIT;
  for (const name of usedTools) {
    const requested = toolLimits.get(name);
    if (requested !== undefined && Number.isFinite(requested)) limit = Math.max(limit, Math.min(MAX_STEP_LIMIT, Math.floor(requested)));
  }
  return limit;
}
