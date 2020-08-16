import * as os from 'os';
import * as mexec from './exec';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

interface Platforms {
  supported: string[];
  available: string[];
}

async function run(): Promise<void> {
  try {
    if (os.platform() !== 'linux') {
      core.setFailed('Only supported on linux platform');
      return;
    }

    const image: string = core.getInput('image') || 'tonistiigi/binfmt:latest';
    const platforms: string = core.getInput('platforms') || 'all';

    core.info(`💎 Installing QEMU static binaries...`);
    await exec.exec('docker', ['run', '--rm', '--privileged', image, '--install', platforms]);

    core.info('🛒 Extracting available platforms...');
    await mexec.exec(`docker`, ['run', '--rm', '--privileged', image], true).then(res => {
      if (res.stderr != '' && !res.success) {
        throw new Error(res.stderr);
      }
      const platforms: Platforms = JSON.parse(res.stdout.trim());
      core.info(`${platforms.supported.join(',')}`);
      core.setOutput('platforms', platforms.supported.join(','));
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
