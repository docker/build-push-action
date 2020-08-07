import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as installer from './installer';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

async function run(): Promise<void> {
  try {
    if (os.platform() !== 'linux') {
      core.setFailed('Only supported on linux platform');
      return;
    }

    const buildxVer: string = core.getInput('buildx-version') || 'latest';
    const dockerConfigHome: string = process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker');
    await installer.buildx(buildxVer, dockerConfigHome);

    core.info('📣 Buildx info');
    await exec.exec('docker', ['buildx', 'version']);

    core.info('🔨 Creating a new builder instance...');
    await exec.exec('docker', [
      'buildx',
      'create',
      '--name',
      `builder-${process.env.GITHUB_SHA}`,
      '--driver',
      'docker-container',
      '--use'
    ]);

    core.info('🏃 Booting builder...');
    await exec.exec('docker', ['buildx', 'inspect', '--bootstrap']);

    core.info('🐳 Docker info');
    await exec.exec('docker', ['info']);

    core.info('🛒 Extracting available platforms...');
    const inspect = child_process.execSync('docker buildx inspect', {
      encoding: 'utf8'
    });
    for (const line of inspect.split(os.EOL)) {
      if (line.startsWith('Platforms')) {
        core.setOutput('platforms', line.replace('Platforms: ', '').replace(/\s/g, '').trim());
        break;
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function cleanup(): Promise<void> {
  try {
    core.info('🚿 Removing builder instance...');
    await exec.exec('docker', ['buildx', 'rm', `builder-${process.env.GITHUB_SHA}`]);
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
