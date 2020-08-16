import * as os from 'os';
import * as path from 'path';
import * as buildx from './buildx';
import * as mexec from './exec';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

async function run(): Promise<void> {
  try {
    if (os.platform() !== 'linux') {
      core.setFailed('Only supported on linux platform');
      return;
    }

    const bxVersion: string = core.getInput('version');
    const bxDriver: string = core.getInput('driver') || 'docker-container';
    const bxDriverOpt: string = core.getInput('driver-opt');
    const bxBuildkitdFlags: string = core.getInput('buildkitd-flags');
    const bxInstall: boolean = /true/i.test(core.getInput('install'));
    const bxUse: boolean = /true/i.test(core.getInput('use'));

    const dockerConfigHome: string = process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker');

    if (!(await buildx.isAvailable()) || bxVersion) {
      await buildx.install(bxVersion || 'latest', dockerConfigHome);
    }

    core.info('📣 Buildx info');
    await exec.exec('docker', ['buildx', 'version']);

    const builderName: string = `builder-${process.env.GITHUB_JOB}-${(await buildx.countBuilders()) + 1}`;
    core.setOutput('name', builderName);
    stateHelper.setBuilderName(builderName);

    core.info('🔨 Creating a new builder instance...');
    let createArgs: Array<string> = ['buildx', 'create', '--name', builderName, '--driver', bxDriver];
    if (bxDriverOpt) {
      createArgs.push('--driver-opt', bxDriverOpt);
    }
    if (bxBuildkitdFlags) {
      createArgs.push('--buildkitd-flags', bxBuildkitdFlags);
    }
    if (bxUse) {
      createArgs.push('--use');
    }

    await exec.exec('docker', createArgs);

    core.info('🏃 Booting builder...');
    await exec.exec('docker', ['buildx', 'inspect', '--bootstrap']);

    if (bxInstall) {
      core.info('🤝 Setting buildx as default builder...');
      await exec.exec('docker', ['buildx', 'install']);
    }

    core.info('🛒 Extracting available platforms...');
    const platforms = await buildx.platforms();
    core.info(`${platforms}`);
    core.setOutput('platforms', platforms);
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function cleanup(): Promise<void> {
  if (stateHelper.builderName.length == 0) {
    return;
  }
  await mexec.exec('docker', ['buildx', 'rm', `${stateHelper.builderName}`], false).then(res => {
    if (res.stderr != '' && !res.success) {
      core.warning(res.stderr);
    }
  });
}

if (!stateHelper.IsPost) {
  run();
} else {
  cleanup();
}
