import * as fs from 'fs';
import * as core from '@actions/core';
import {exec} from 'child_process';
import {promisify} from 'util';
import * as TOML from '@iarna/toml';
import * as reporter from './reporter';

const mountPoint = '/var/lib/buildkit';
const execAsync = promisify(exec);

async function maybeFormatBlockDevice(device: string): Promise<string> {
  try {
    // Check if device is formatted with ext4
    try {
      const {stdout} = await execAsync(`sudo blkid -o value -s TYPE ${device}`);
      if (stdout.trim() === 'ext4') {
        core.debug(`Device ${device} is already formatted with ext4`);
        try {
          // Run resize2fs to ensure filesystem uses full block device
          await execAsync(`sudo resize2fs -f ${device}`);
          core.debug(`Resized ext4 filesystem on ${device}`);
        } catch (error) {
          core.warning(`Error resizing ext4 filesystem on ${device}: ${error}`);
        }
        return device;
      }
    } catch (error) {
      // blkid returns non-zero if no filesystem found, which is fine
      core.debug(`No filesystem found on ${device}, will format it`);
    }

    // Format device with ext4
    core.debug(`Formatting device ${device} with ext4`);
    await execAsync(`sudo mkfs.ext4 -m0 -Enodiscard,lazy_itable_init=1,lazy_journal_init=1 -F ${device}`);
    core.debug(`Successfully formatted ${device} with ext4`);
    return device;
  } catch (error) {
    core.error(`Failed to format device ${device}:`, error);
    throw error;
  }
}

export async function getNumCPUs(): Promise<number> {
  try {
    const {stdout} = await execAsync('sudo nproc');
    return parseInt(stdout.trim());
  } catch (error) {
    core.warning('Failed to get CPU count, defaulting to 1:', error);
    return 1;
  }
}

async function writeBuildkitdTomlFile(parallelism: number, device: string): Promise<void> {
  const diskSize = await getDiskSize(device);
  const jsonConfig: TOML.JsonMap = {
    root: '/var/lib/buildkit',
    grpc: {
      address: ['unix:///run/buildkit/buildkitd.sock']
    },
    registry: {
      'docker.io': {
        mirrors: ['http://192.168.127.1:5000'],
        http: true,
        insecure: true
      },
      '192.168.127.1:5000': {
        http: true,
        insecure: true
      }
    },
    worker: {
      oci: {
        enabled: true,
        gc: true,
        gckeepstorage: diskSize.toString(),
        'max-parallelism': parallelism,
        snapshotter: 'overlayfs',
        gcpolicy: [
          {
            all: true,
            keepDuration: 1209600
          },
          {
            all: true,
            keepBytes: diskSize.toString()
          }
        ]
      },
      containerd: {
        enabled: false
      }
    }
  };

  const tomlString = TOML.stringify(jsonConfig);

  try {
    await fs.promises.writeFile('buildkitd.toml', tomlString);
    core.debug(`TOML configuration is ${tomlString}`);
  } catch (err) {
    core.warning('error writing TOML configuration:', err);
    throw err;
  }
}

async function startBuildkitd(parallelism: number, device: string): Promise<string> {
  try {
    await writeBuildkitdTomlFile(parallelism, device);
    await execAsync('sudo mkdir -p /run/buildkit');
    await execAsync('sudo chmod 755 /run/buildkit');
    const addr = 'unix:///run/buildkit/buildkitd.sock';
    const {stdout: startStdout, stderr: startStderr} = await execAsync(
      `sudo nohup buildkitd --debug --addr ${addr} --allow-insecure-entitlement security.insecure --config=buildkitd.toml --allow-insecure-entitlement network.host > buildkitd.log 2>&1 &`
    );

    if (startStderr) {
      throw new Error(`error starting buildkitd service: ${startStderr}`);
    }
    core.debug(`buildkitd daemon started successfully ${startStdout}`);

    const {stderr} = await execAsync(`pgrep -f buildkitd`);
    if (stderr) {
      throw new Error(`error finding buildkitd PID: ${stderr}`);
    }
    return addr;
  } catch (error) {
    core.error('failed to start buildkitd daemon:', error);
    throw error;
  }
}

async function getDiskSize(device: string): Promise<number> {
  try {
    const {stdout} = await execAsync(`sudo lsblk -b -n -o SIZE ${device}`);
    const sizeInBytes = parseInt(stdout.trim(), 10);
    if (isNaN(sizeInBytes)) {
      throw new Error('Failed to parse disk size');
    }
    return sizeInBytes;
  } catch (error) {
    console.error(`Error getting disk size: ${error.message}`);
    throw error;
  }
}

async function getStickyDisk(options?: {signal?: AbortSignal}): Promise<{expose_id: string; device: string}> {
  const client = await reporter.createBlacksmithAgentClient();
  const formData = new FormData();
  // TODO(adityamaru): Support a stickydisk-per-build flag that will namespace the stickydisks by Dockerfile.
  // For now, we'll use the repo name as the stickydisk key.
  const repoName = process.env.GITHUB_REPO_NAME || '';
  if (repoName === '') {
    throw new Error('GITHUB_REPO_NAME is not set');
  }
  formData.append('stickyDiskKey', repoName);
  formData.append('region', process.env.BLACKSMITH_REGION || 'eu-central');
  formData.append('installationModelID', process.env.BLACKSMITH_INSTALLATION_MODEL_ID || '');
  formData.append('vmID', process.env.VM_ID || '');
  core.debug(`Getting sticky disk for ${repoName}`);
  core.debug('FormData contents:');
  for (const pair of formData.entries()) {
    core.debug(`${pair[0]}: ${pair[1]}`);
  }
  const response = await reporter.get(client, '/stickydisks', formData, options);
  const exposeId = response.data?.expose_id || '';
  const device = response.data?.disk_identifier || '';
  return {expose_id: exposeId, device: device};
}

export async function startAndConfigureBuildkitd(parallelism: number, device: string): Promise<string> {
  const buildkitdAddr = await startBuildkitd(parallelism, device);
  core.debug(`buildkitd daemon started at addr ${buildkitdAddr}`);

  // Change permissions on the buildkitd socket to allow non-root access
  const startTime = Date.now();
  const timeout = 5000; // 5 seconds in milliseconds

  while (Date.now() - startTime < timeout) {
    if (fs.existsSync('/run/buildkit/buildkitd.sock')) {
      // Change permissions on the buildkitd socket to allow non-root access
      await execAsync(`sudo chmod 666 /run/buildkit/buildkitd.sock`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Poll every 100ms
  }

  if (!fs.existsSync('/run/buildkit/buildkitd.sock')) {
    throw new Error('buildkitd socket not found after 5s timeout');
  }
  return buildkitdAddr;
}

// setupStickyDisk mounts a sticky disk for the entity and returns the device information.
// throws an error if it is unable to do so because of a timeout or an error
export async function setupStickyDisk(dockerfilePath: string): Promise<{device: string; buildId?: string | null; exposeId: string}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let buildResponse: {docker_build_id: string} | null = null;
    let exposeId: string = '';
    let device: string = '';
    const stickyDiskResponse = await getStickyDisk({signal: controller.signal});
    exposeId = stickyDiskResponse.expose_id;
    device = stickyDiskResponse.device;
    if (device === '') {
      // TODO(adityamaru): Remove this once all of our VM agents are returning the device in the stickydisk response.
      device = '/dev/vdb';
    }
    clearTimeout(timeoutId);
    await maybeFormatBlockDevice(device);
    buildResponse = await reporter.reportBuild(dockerfilePath);
    await execAsync(`sudo mkdir -p ${mountPoint}`);
    await execAsync(`sudo mount ${device} ${mountPoint}`);
    core.debug(`${device} has been mounted to ${mountPoint}`);
    core.info('Successfully obtained sticky disk');
    return {device, buildId: buildResponse?.docker_build_id, exposeId: exposeId};
  } catch (error) {
    core.warning(`Error in setupStickyDisk: ${(error as Error).message}`);
    throw error;
  }
}
