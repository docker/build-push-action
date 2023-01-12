import * as fs from 'fs';
import * as buildx from './buildx';
import * as context from './context';
import * as docker from './docker';
import * as github from './github';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

async function run(): Promise<void> {
  try {
    const defContext = context.defaultContext();
    const inputs: context.Inputs = await context.getInputs(defContext);

    // standalone if docker cli not available
    const standalone = !(await docker.isAvailable());

    await core.group(`GitHub Actions runtime token access controls`, async () => {
      const actionsRuntimeToken = process.env['ACTIONS_RUNTIME_TOKEN'];
      if (actionsRuntimeToken) {
        core.info(JSON.stringify(JSON.parse(github.parseRuntimeToken(actionsRuntimeToken).ac as string), undefined, 2));
      } else {
        core.info(`ACTIONS_RUNTIME_TOKEN not set`);
      }
    });

    core.startGroup(`Docker info`);
    if (standalone) {
      core.info(`Docker info skipped in standalone mode`);
    } else {
      await exec.exec('docker', ['version'], {
        failOnStdErr: false
      });
      await exec.exec('docker', ['info'], {
        failOnStdErr: false
      });
    }
    core.endGroup();

    if (!(await buildx.isAvailable(standalone))) {
      core.setFailed(`Docker buildx is required. See https://github.com/docker/setup-buildx-action to set up buildx.`);
      return;
    }
    stateHelper.setTmpDir(context.tmpDir());

    const buildxVersion = await buildx.getVersion(standalone);
    await core.group(`Buildx version`, async () => {
      const versionCmd = buildx.getCommand(['version'], standalone);
      await exec.exec(versionCmd.command, versionCmd.args, {
        failOnStdErr: false
      });
    });

    const args: string[] = await context.getArgs(inputs, defContext, buildxVersion, standalone);
    const buildCmd = buildx.getCommand(args, standalone);
    await exec
      .getExecOutput(buildCmd.command, buildCmd.args, {
        ignoreReturnCode: true
      })
      .then(res => {
        if (res.stderr.length > 0 && res.exitCode != 0) {
          throw new Error(`buildx failed with: ${res.stderr.match(/(.*)\s*$/)?.[0]?.trim() ?? 'unknown error'}`);
        }
      });

    const imageID = await buildx.getImageID();
    const metadata = await buildx.getMetadata();
    const digest = await buildx.getDigest(metadata);

    if (imageID) {
      await core.group(`ImageID`, async () => {
        core.info(imageID);
        core.setOutput('imageid', imageID);
      });
    }
    if (digest) {
      await core.group(`Digest`, async () => {
        core.info(digest);
        core.setOutput('digest', digest);
      });
    }
    if (metadata) {
      await core.group(`Metadata`, async () => {
        core.info(metadata);
        core.setOutput('metadata', metadata);
      });
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function cleanup(): Promise<void> {
  if (stateHelper.tmpDir.length > 0) {
    core.startGroup(`Removing temp folder ${stateHelper.tmpDir}`);
    fs.rmSync(stateHelper.tmpDir, {recursive: true});
    core.endGroup();
  }
}

if (!stateHelper.IsPost) {
  run();
} else {
  cleanup();
}
