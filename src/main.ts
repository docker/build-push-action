import * as fs from 'fs';
import * as buildx from './buildx';
import * as context from './context';
import * as exec from './exec';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';

async function run(): Promise<void> {
  try {
    core.startGroup(`Docker info`);
    await exec.exec('docker', ['version']);
    await exec.exec('docker', ['info']);
    core.endGroup();

    if (!(await buildx.isAvailable())) {
      core.setFailed(`Docker buildx is required. See https://github.com/docker/setup-buildx-action to set up buildx.`);
      return;
    }
    stateHelper.setTmpDir(context.tmpDir());

    const buildxVersion = await buildx.getVersion();
    core.info(`Using buildx ${buildxVersion}`);

    const defContext = context.defaultContext();
    let inputs: context.Inputs = await context.getInputs(defContext);

    core.info(`Building...`);
    const args: string[] = await context.getArgs(inputs, defContext, buildxVersion);
    await exec.exec('docker', args).then(res => {
      if (res.stderr != '' && !res.success) {
        throw new Error(`buildx call failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
      }
    });

    const imageID = await buildx.getImageID();
    if (imageID) {
      core.startGroup(`Extracting digest`);
      core.info(`${imageID}`);
      context.setOutput('digest', imageID);
      core.endGroup();
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function cleanup(): Promise<void> {
  if (stateHelper.tmpDir.length > 0) {
    core.startGroup(`Removing temp folder ${stateHelper.tmpDir}`);
    fs.rmdirSync(stateHelper.tmpDir, {recursive: true});
    core.endGroup();
  }
}

if (!stateHelper.IsPost) {
  run();
} else {
  cleanup();
}
