import * as os from 'os';
import * as buildx from './buildx';
import {Inputs, getInputs, getArgs} from './context';
import * as github from './github';
import * as stateHelper from './state-helper';
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

    let inputs: Inputs = await getInputs();
    const args: string[] = await getArgs(inputs);

    if (inputs.builder) {
      core.info(`📌 Using builder instance ${inputs.builder}`);
      await buildx.use(inputs.builder);
    }

    inputs = await github.restoreCache(inputs);

    core.info(`🏃 Starting build...`);
    await exec.exec('docker', args);
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function post(): Promise<void> {
  const inputs: Inputs = await getInputs();
  await github.saveCache(inputs);
}

if (!stateHelper.IsPost) {
  run();
} else {
  post();
}
