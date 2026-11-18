import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Score an evidence-backed trial; this does not execute or verify its evidence. */
export function scoreTrial(rubric, trial) {
  requireValue(rubric?.schema_version === 1 && trial?.schema_version === 1, 'Expected schema_version: 1');
  requireValue(Array.isArray(rubric.criteria) && rubric.criteria.length > 0, 'Expected nonempty criteria');
  const criteria = new Map();
  let totalWeight = 0;
  for (const item of rubric.criteria) {
    requireValue(nonempty(item.id) && !criteria.has(item.id), 'Criterion IDs must be nonempty and unique');
    requireValue(typeof item.critical === 'boolean', `${item.id}: critical must be boolean`);
    requireValue(Number.isFinite(item.weight) && item.weight > 0, `${item.id}: weight must be finite and positive`);
    totalWeight += item.weight;
    requireValue(Number.isFinite(totalWeight), 'Sum of criterion weights must be finite');
    requireValue([0, 1, 2].every(score => nonempty(item.anchors?.[score])), `${item.id}: missing score anchors`);
    criteria.set(item.id, item);
  }
  requireValue([...criteria.values()].some(item => item.critical), 'At least one critical criterion is required');
  if (['blocked', 'contaminated'].includes(trial.status)) {
    requireValue(nonempty(trial.reason), 'Excluded trials require a reason');
    return { status: trial.status, success: null, score_percent: null, excluded_from_quality_rates: true, reason: trial.reason };
  }
  requireValue(trial.status === 'completed', 'Expected completed, blocked or contaminated status');
  requireValue(typeof trial.oracle_passed === 'boolean', 'Completed trials require oracle_passed');
  requireValue(Array.isArray(trial.observations), 'Expected observations');
  const seen = new Set();
  let earned = 0;
  const failedCritical = [];
  for (const observation of trial.observations) {
    const item = criteria.get(observation.id);
    requireValue(item && !seen.has(observation.id), 'Unknown or duplicated observation ID');
    requireValue(Number.isInteger(observation.score) && observation.score >= 0 && observation.score <= 2, `${item.id}: score must be 0, 1 or 2`);
    requireValue(Array.isArray(observation.evidence) && observation.evidence.length > 0 && observation.evidence.every(nonempty), `${item.id}: evidence is required`);
    seen.add(item.id);
    earned += (item.weight / totalWeight) * (observation.score / 2);
    if (item.critical && observation.score !== 2) failedCritical.push(item.id);
  }
  requireValue(seen.size === criteria.size, 'Every criterion needs exactly one observation');
  return {
    status: 'completed',
    success: trial.oracle_passed && failedCritical.length === 0,
    score_percent: Math.round(earned * 10000) / 100,
    failed_critical: failedCritical,
    oracle_passed: trial.oracle_passed,
    excluded_from_quality_rates: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    requireValue(process.argv.length === 4, 'Usage: node score-trial.mjs <rubric.json> <trial.json>');
    const result = scoreTrial(...process.argv.slice(2).map(path => JSON.parse(readFileSync(path, 'utf8'))));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.success === true ? 0 : result.success === false ? 1 : 2;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
