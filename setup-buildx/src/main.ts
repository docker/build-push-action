import * as os from 'os';
import * as path from 'path';
import * as buildx from './buildx';
import * as exec from './exec';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';

async function run(): Promise<void> {
  try {
    if (os.platform() !== 'linux') {
      core.setFailed('Only supported on linux platform');
      return;
    }

    const bxVersion: string = core.getInput('version');
    const bxDriver: string = core.getInput('driver') || 'docker-container';
    const bxDriverOpt: string = core.getInput('driver-opt');
    const bxInstall: boolean = /true/i.test(core.getInput('install'));
    const bxUse: boolean = /true/i.test(core.getInput('use'));

    const dockerConfigHome: string = process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker');

    if (!(await buildx.isAvailable()) || bxVersion) {
      await buildx.install(bxVersion || 'latest', dockerConfigHome);
    }

    core.info('📣 Buildx info');
    await exec.exec('docker', ['buildx', 'version'], false);

    const builderName: string = `builder-${(await buildx.countBuilders()) + 1}-${process.env.GITHUB_JOB}`;
    core.setOutput('name', builderName);
    stateHelper.setBuilderName(builderName);

    core.info('🔨 Creating a new builder instance...');
    let createArgs: Array<string> = ['buildx', 'create', '--name', builderName, '--driver', bxDriver];
    if (bxDriverOpt) {
      createArgs.push('--driver-opt', bxDriverOpt);
    }
    if (bxUse) {
      createArgs.push('--use');
    }

    await exec.exec('docker', createArgs, false);

    core.info('🏃 Booting builder...');
    await exec.exec('docker', ['buildx', 'inspect', '--bootstrap'], false);

    if (bxInstall) {
      core.info('🤝 Setting buildx as default builder...');
      await exec.exec('docker', ['buildx', 'install'], false);
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
  try {
    core.info('🚿 Removing builder instance...');
    await exec.exec('docker', ['buildx', 'rm', `${process.env.STATE_builderName}`], false);
  } catch (error) {
    core.warning(error.message);
  }
}

if (!stateHelper.IsPost) {
  run();
} else {
  cleanup();
}
