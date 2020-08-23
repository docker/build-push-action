import * as os from 'os';
import * as buildx from './buildx';
import {Inputs, getInputs, getArgs} from './context';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

async function run(): Promise<void> {
  try {
    if (os.platform() !== 'linux') {
      core.setFailed('Only supported on linux platform');
      return;
    }

    if (!(await buildx.isAvailable())) {
      core.setFailed(`Buildx is required. See https://github.com/docker/setup-buildx-action to set up buildx.`);
      return;
    }

    const buildxVersion = await buildx.getVersion();
    core.info(`📣 Buildx version: ${buildxVersion}`);

    let inputs: Inputs = await getInputs();
    if (inputs.builder) {
      core.info(`📌 Using builder instance ${inputs.builder}`);
      await buildx.use(inputs.builder);
    }

    core.info(`🏃 Starting build...`);
    const args: string[] = await getArgs(inputs, buildxVersion);
    await exec.exec('docker', args);

    const imageID = await buildx.getImageID();
    if (imageID) {
      core.info('🛒 Extracting digest...');
      core.info(`${imageID}`);
      core.setOutput('digest', imageID);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
