'use strict';

const { fixedPaths, syncFrontend } = require('./frontend-dist.cjs');

async function main() {
  if (process.argv.length !== 2) throw new Error('sync:frontend accepts no path or other arguments');
  const result = await syncFrontend(fixedPaths());
  if (result.previousCleanupPending) throw new Error('Frontend target is complete, but a previous generated directory could not be removed; packaging remains blocked');
  console.log(`Frontend synchronized: ${result.fileCount} files, ${result.totalBytes} bytes, index ${result.indexSha256}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
