import * as os from 'os';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

async function run(): Promise<void> {
  try {
    if (os.platform() !== 'linux') {
      core.setFailed('Only supported on linux platform');
      return;
    }

    const qemuVer: string = core.getInput('qemu-version') || 'latest';

    core.info(`💎 Installing QEMU static binaries...`);
    await exec.exec('docker', [
      'run',
      '--rm',
      '--privileged',
      `multiarch/qemu-user-static:${qemuVer}`,
      '--reset',
      '-p',
      'yes',
      '--credential',
      'yes'
    ]);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
