'use strict';

const { REPAIR_SUGGEST_ONLY, validateDiagnosticIssue } = require('../shared/contracts.cjs');

const DEFINITIONS = Object.freeze({
  'marketplace-missing-incomplete': {
    impact: 'Bundled marketplace content is missing or incomplete.',
    plannedActions: ['Restore only the validated bundled marketplace snapshot through the frozen repair core.'],
    risk: 'medium', writeScope: ['bundled marketplace cache'], canSkip: true, requiresRestart: true, suggestionMode: 'suggest-repair'
  },
  'plugin-cache-drift': {
    impact: 'Bundled plugin cache content does not match the trusted package state.',
    plannedActions: ['Rebuild affected cache entries through the frozen repair core after backup.'],
    risk: 'medium', writeScope: ['bundled plugin cache'], canSkip: true, requiresRestart: true, suggestionMode: 'suggest-repair'
  },
  'latest-pointer': {
    impact: 'The latest pointer is absent, stale, or points outside the validated package.',
    plannedActions: ['Recreate the validated latest pointer through the frozen repair core.'],
    risk: 'medium', writeScope: ['bundled plugin latest pointer'], canSkip: true, requiresRestart: true, suggestionMode: 'suggest-repair'
  },
  'runtime-node-repl-path': {
    impact: 'The runtime node_repl path does not resolve to the validated bundled runtime.',
    plannedActions: ['Restore the validated runtime path through the frozen repair core.'],
    risk: 'medium', writeScope: ['bundled runtime metadata'], canSkip: true, requiresRestart: true, suggestionMode: 'suggest-repair'
  },
  'extension-host-lock': {
    impact: 'An extension host appears to hold a file lock.', risk: 'high', canSkip: true, requiresRestart: false, suggestionMode: 'report-only'
  },
  'uninstall-eperm-longpath': {
    impact: 'An uninstall or long-path operation reported EPERM.', risk: 'high', canSkip: true, requiresRestart: false, suggestionMode: 'report-only'
  },
  'computer-use-connection': {
    impact: 'Computer Use connectivity could not be proven by static diagnosis.', risk: 'unknown', canSkip: true, requiresRestart: false, suggestionMode: 'report-only'
  },
  'browser-chrome-availability': {
    impact: 'Browser or Chrome availability requires surface-specific runtime validation.', risk: 'unknown', canSkip: true, requiresRestart: false, suggestionMode: 'report-only'
  }
});

function makeIssue(category, evidence, confidence = 0.75, knownIssue = null) {
  const definition = DEFINITIONS[category];
  if (!definition) throw new TypeError(`Unsupported diagnostic category: ${category}`);
  return validateDiagnosticIssue({
    category,
    evidence: Array.isArray(evidence) ? evidence : [String(evidence)],
    impact: definition.impact,
    plannedActions: REPAIR_SUGGEST_ONLY.has(category) ? definition.plannedActions : [],
    risk: definition.risk,
    writeScope: REPAIR_SUGGEST_ONLY.has(category) ? definition.writeScope : [],
    knownIssue,
    canSkip: definition.canSkip,
    requiresRestart: definition.requiresRestart,
    confidence,
    suggestionMode: definition.suggestionMode
  });
}

function classifyEvidence(lines) {
  const joined = lines.join('\n');
  const rules = [
    ['marketplace-missing-incomplete', /marketplace.*(missing|incomplete)|missing.*marketplace/i],
    ['plugin-cache-drift', /(plugin|cache).*(drift|hash mismatch|missing file)/i],
    ['latest-pointer', /(latest).*(junction|pointer|missing|invalid|stale)/i],
    ['runtime-node-repl-path', /(node_repl|runtime).*(path|missing|invalid|mismatch)/i],
    ['extension-host-lock', /(extension host|extension-host).*(lock|busy|in use)/i],
    ['uninstall-eperm-longpath', /(eperm|long.?path|uninstall.*denied)/i],
    ['computer-use-connection', /(computer use).*(connection|connect|transport|unavailable)/i],
    ['browser-chrome-availability', /(browser|chrome).*(availability|unavailable|not available)/i]
  ];
  return rules.filter(([, pattern]) => pattern.test(joined)).map(([category, pattern]) => {
    const evidence = lines.filter((line) => pattern.test(line)).slice(0, 8);
    return makeIssue(category, evidence.length ? evidence : [`Matched ${category}`]);
  });
}

module.exports = { DEFINITIONS, makeIssue, classifyEvidence };
