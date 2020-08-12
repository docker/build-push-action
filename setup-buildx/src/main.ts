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

    const buildxVer: string = core.getInput('buildx-version');
    const driver: string = core.getInput('driver') || 'docker-container';
    const driverOpt: string = core.getInput('driver-opt');
    const install: boolean = /true/i.test(core.getInput('install'));
    const use: boolean = /true/i.test(core.getInput('use'));

    const dockerConfigHome: string = process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker');

    if (!(await buildx.isAvailable()) || buildxVer) {
      await buildx.install(buildxVer || 'latest', dockerConfigHome);
    }

    core.info('📣 Buildx info');
    await exec.exec('docker', ['buildx', 'version'], false);

    const builderName: string = `builder-${(await buildx.countBuilders()) + 1}-${process.env.GITHUB_JOB}`;
    core.saveState('builderName', builderName);
    core.setOutput('name', builderName);

    core.info('🔨 Creating a new builder instance...');
    let createArgs: Array<string> = ['buildx', 'create', '--name', builderName, '--driver', driver];
    if (driverOpt) {
      createArgs.push('--driver-opt', driverOpt);
    }
    if (use) {
      createArgs.push('--use');
    }

    await exec.exec('docker', createArgs, false);

    core.info('🏃 Booting builder...');
    await exec.exec('docker', ['buildx', 'inspect', '--bootstrap'], false);

    if (install) {
      core.info('🤝 Setting buildx as default builder...');
      await exec.exec('docker', ['buildx', 'install'], false);
    }

    core.info('🐳 Docker info');
    await exec.exec('docker', ['info'], false);

    core.info('🛒 Extracting available platforms...');
    await exec.exec(`docker`, ['buildx', 'inspect'], true).then(res => {
      if (res.stderr != '' && !res.success) {
        throw new Error(res.stderr);
      }
      for (const line of res.stdout.trim().split(os.EOL)) {
        if (line.startsWith('Platforms')) {
          core.setOutput('platforms', line.replace('Platforms: ', '').replace(/\s/g, '').trim());
          break;
        }
      }
    });
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

// Main
if (!stateHelper.IsPost) {
  run();
}
// Post
else {
  cleanup();
}
