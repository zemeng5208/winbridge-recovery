'use strict';

const { fixedPaths, assertNoTransientSiblings, verifyFrontendDist } = require('./frontend-dist.cjs');

async function main() {
  if (process.argv.length !== 2) throw new Error('verify:frontend accepts no path or other arguments');
  const { frontendRoot, targetDist } = fixedPaths();
  await assertNoTransientSiblings(frontendRoot);
  const result = await verifyFrontendDist(targetDist);
  console.log(`Frontend verified: ${result.fileCount} files, ${result.totalBytes} bytes, index ${result.indexSha256}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
