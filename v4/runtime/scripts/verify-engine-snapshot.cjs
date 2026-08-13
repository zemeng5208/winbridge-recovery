'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

async function hash(file) {
  const content = await fs.readFile(file);
  return crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
}

async function main() {
  const root = path.resolve(__dirname, '..', 'engine', 'frozen-3.1.1');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'SNAPSHOT.json'), 'utf8'));
  for (const entry of manifest.files) {
    const actual = await hash(path.join(root, ...entry.path.split('/')));
    if (actual !== entry.sha256) throw new Error(`Snapshot hash mismatch: ${entry.path}`);
  }
  console.log(`Frozen snapshot verified: ${manifest.version}, ${manifest.files.length} files, commit ${manifest.sourceCommit}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
