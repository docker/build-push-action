import * as os from 'os';
import * as buildx from './buildx';
import {Inputs, loadInputs} from './context-helper';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

async function run(): Promise<void> {
  try {
    if (os.platform() !== 'linux') {
      core.setFailed('Only supported on linux platform');
      return;
    }

    const inputs: Inputs = await loadInputs();

    if (!(await buildx.isAvailable())) {
      core.setFailed(`Buildx is required. See https://github.com/docker/setup-buildx-action to set up buildx.`);
      return;
    }

    let buildArgs: Array<string> = ['buildx', 'build'];

    if (inputs.builder) {
      core.info(`📌 Using builder instance ${inputs.builder}`);
      await buildx.use(inputs.builder);
    }
    if (inputs.file) {
      buildArgs.push('--file', inputs.file);
    }
    await asyncForEach(inputs.buildArgs, async buildArg => {
      buildArgs.push('--build-arg', buildArg);
    });
    await asyncForEach(inputs.labels, async label => {
      buildArgs.push('--label', label);
    });
    await asyncForEach(inputs.tags, async tag => {
      buildArgs.push('--tag', tag);
    });
    if (inputs.pull) {
      buildArgs.push('--pull');
    }
    if (inputs.target) {
      buildArgs.push('--target', inputs.target);
    }
    if (inputs.noCache) {
      buildArgs.push('--no-cache');
    }
    if (inputs.platforms) {
      buildArgs.push('--platform', inputs.platforms);
    }
    if (inputs.load) {
      buildArgs.push('--load');
    }
    if (inputs.push) {
      buildArgs.push('--push');
    }
    await asyncForEach(inputs.outputs, async output => {
      buildArgs.push('--output', output);
    });
    await asyncForEach(inputs.cacheFrom, async cacheFrom => {
      buildArgs.push('--cache-from', cacheFrom);
    });
    await asyncForEach(inputs.cacheTo, async cacheTo => {
      buildArgs.push('--cache-from', cacheTo);
    });
    buildArgs.push(inputs.context);

    core.info(`🏃 Starting build...`);
    await exec.exec('docker', buildArgs);
  } catch (error) {
    core.setFailed(error.message);
  }
}

const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};

run();
