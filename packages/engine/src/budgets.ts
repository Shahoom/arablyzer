/**
 * BUILD-PLAN §11: a whole scan stays within 120 s; rendering gets what is left of it. On a subpath
 * of its own (`@arablyzer/engine/budgets`), so the worker reads it without loading the engine.
 */
export const SCAN_BUDGET_MS = 120_000
