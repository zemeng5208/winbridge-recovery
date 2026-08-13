'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

class SystemProfileStore {
  constructor(dataRoot, detectAppPackage = async () => null) {
    this.file = path.join(dataRoot, 'system-profile', 'profile.json');
    this.detectAppPackage = detectAppPackage;
  }

  async get() {
    try {
      const value = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (value.schemaVersion === 1) return value;
    } catch {}
    return this.refresh();
  }

  async refresh() {
    let appPackage = null;
    let appPackageError = null;
    try {
      const detected = await this.detectAppPackage();
      if (detected) appPackage = {
        packageName: detected.PackageName,
        packageFamilyName: detected.PackageFamilyName,
        version: detected.Version,
        desktopExecutableAvailable: true
      };
    } catch (error) {
      appPackageError = error.message;
    }
    const value = {
      schemaVersion: 1,
      detectedAt: new Date().toISOString(),
      platform: process.platform,
      release: os.release(),
      architecture: process.arch,
      cpuLogicalCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      nodeRuntime: process.version,
      appPackage,
      appPackageError,
      cachePolicy: 'first-detection-then-manual-refresh'
    };
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, this.file);
    return value;
  }
}

module.exports = { SystemProfileStore };
