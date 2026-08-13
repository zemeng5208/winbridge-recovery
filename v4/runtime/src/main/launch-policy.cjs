'use strict';

const REAL_REPAIR_SWITCH = '--enable-real-repair';

function hasExactLaunchSwitch(argv, expected) {
  if (!Array.isArray(argv)) return false;
  return argv.slice(1).some((argument) => argument === expected);
}

function deriveRealRepairCapability({ isPackaged, argv = process.argv }) {
  return isPackaged === true && hasExactLaunchSwitch(argv, REAL_REPAIR_SWITCH);
}

module.exports = { REAL_REPAIR_SWITCH, hasExactLaunchSwitch, deriveRealRepairCapability };
