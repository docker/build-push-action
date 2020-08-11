import * as os from 'os';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

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
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
