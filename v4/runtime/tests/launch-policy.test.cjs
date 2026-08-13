'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { REAL_REPAIR_SWITCH, hasExactLaunchSwitch, deriveRealRepairCapability } = require('../src/main/launch-policy.cjs');

test('real repair requires both packaged state and the exact launch switch', () => {
  assert.equal(REAL_REPAIR_SWITCH, '--enable-real-repair');
  assert.equal(deriveRealRepairCapability({ isPackaged: false, argv: ['electron.exe', '.', REAL_REPAIR_SWITCH] }), false);
  assert.equal(deriveRealRepairCapability({ isPackaged: true, argv: ['WinBridge-Recovery-V4.exe'] }), false);
  assert.equal(deriveRealRepairCapability({ isPackaged: true, argv: ['WinBridge-Recovery-V4.exe', REAL_REPAIR_SWITCH] }), true);
});

test('lookalike or value-bearing arguments cannot enable repair', () => {
  assert.equal(hasExactLaunchSwitch(['app.exe', '--enable-real-repair=true'], REAL_REPAIR_SWITCH), false);
  assert.equal(hasExactLaunchSwitch(['app.exe', '--ENABLE-REAL-REPAIR'], REAL_REPAIR_SWITCH), false);
  assert.equal(hasExactLaunchSwitch(['app.exe', ' --enable-real-repair'], REAL_REPAIR_SWITCH), false);
});
