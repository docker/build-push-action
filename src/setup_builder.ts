import * as fs from 'fs';
import * as core from '@actions/core';
import {exec, spawn} from 'child_process';
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

async function writeBuildkitdTomlFile(parallelism: number): Promise<void> {
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
        // Disable automatic garbage collection, since we will prune manually. Automatic GC
        // has been seen to negatively affect startup times of the daemon.
        gc: false,
        'max-parallelism': parallelism,
        snapshotter: 'overlayfs'
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

async function startBuildkitd(parallelism: number): Promise<string> {
  try {
    await writeBuildkitdTomlFile(parallelism);
    await execAsync('sudo mkdir -p /run/buildkit');
    await execAsync('sudo chmod 755 /run/buildkit');
    const addr = 'unix:///run/buildkit/buildkitd.sock';

    const logStream = fs.createWriteStream('buildkitd.log');
    const buildkitd = spawn('sudo', ['buildkitd', '--debug', '--addr', addr, '--allow-insecure-entitlement', 'security.insecure', '--config=buildkitd.toml', '--allow-insecure-entitlement', 'network.host'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Pipe stdout and stderr to log file
    buildkitd.stdout.pipe(logStream);
    buildkitd.stderr.pipe(logStream);

    buildkitd.on('error', error => {
      throw new Error(`Failed to start buildkitd: ${error.message}`);
    });

    // Wait for buildkitd PID to appear with backoff retry
    const startTime = Date.now();
    const timeout = 10000; // 10 seconds
    const backoff = 300; // 300ms

    while (Date.now() - startTime < timeout) {
      try {
        const {stdout} = await execAsync('pgrep buildkitd');
        if (stdout.trim()) {
          core.info(`buildkitd daemon started successfully with PID ${stdout.trim()}`);
          return addr;
        }
      } catch (error) {
        // pgrep returns non-zero if process not found, which is expected while waiting
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw new Error('Timed out waiting for buildkitd to start after 10 seconds');
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

export async function getStickyDisk(options?: {signal?: AbortSignal}): Promise<{expose_id: string; device: string}> {
  const client = await reporter.createBlacksmithAgentClient();

  const stickyDiskKey = process.env.GITHUB_REPO_NAME || '';
  if (stickyDiskKey === '') {
    throw new Error('GITHUB_REPO_NAME is not set');
  }
  core.debug(`Getting sticky disk for ${stickyDiskKey}`);

  const response = await client.getStickyDisk(
    {
      stickyDiskKey: stickyDiskKey,
      region: process.env.BLACKSMITH_REGION || 'eu-central',
      installationModelId: process.env.BLACKSMITH_INSTALLATION_MODEL_ID || '',
      vmId: process.env.VM_ID || '',
      stickyDiskType: 'dockerfile',
      repoName: process.env.GITHUB_REPO_NAME || '',
      stickyDiskToken: process.env.BLACKSMITH_STICKYDISK_TOKEN || ''
    },
    {
      signal: options?.signal
    }
  );
  return {
    expose_id: response.exposeId || '',
    device: response.diskIdentifier || ''
  };
}

// buildkitdTimeoutMs states the max amount of time this action will wait for the buildkitd
// daemon to start have its socket ready. It also additionally governs how long we will wait for
// the buildkitd workers to be ready.
const buildkitdTimeoutMs = 15000;

export async function startAndConfigureBuildkitd(parallelism: number): Promise<string> {
  const buildkitdAddr = await startBuildkitd(parallelism);
  core.debug(`buildkitd daemon started at addr ${buildkitdAddr}`);

  // Change permissions on the buildkitd socket to allow non-root access
  const startTime = Date.now();
  const timeout = buildkitdTimeoutMs;

  while (Date.now() - startTime < timeout) {
    if (fs.existsSync('/run/buildkit/buildkitd.sock')) {
      // Change permissions on the buildkitd socket to allow non-root access
      await execAsync(`sudo chmod 666 /run/buildkit/buildkitd.sock`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 100ms
  }

  if (!fs.existsSync('/run/buildkit/buildkitd.sock')) {
    throw new Error('buildkitd socket not found after 15s timeout');
  }
  // Check that buildkit instance is ready by querying workers for up to 30s
  const startTimeBuildkitReady = Date.now();
  const timeoutBuildkitReady = buildkitdTimeoutMs;

  while (Date.now() - startTimeBuildkitReady < timeoutBuildkitReady) {
    try {
      const {stdout} = await execAsync('sudo buildctl debug workers');
      const lines = stdout.trim().split('\n');
      if (lines.length > 1) {
        // Check if we have output lines beyond the header
        break;
      }
    } catch (error) {
      core.debug(`Error checking buildkit workers: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Final check after timeout.
  try {
    const {stdout} = await execAsync('sudo buildctl debug workers');
    const lines = stdout.trim().split('\n');
    if (lines.length <= 1) {
      throw new Error('buildkit workers not ready after 15s timeout');
    }
  } catch (error) {
    core.warning(`Error checking buildkit workers: ${error.message}`);
    throw error;
  }

  // Start cache pruning in the background without blocking.
  pruneBuildkitCache().catch(error => {
    core.warning(`Background cache pruning failed: ${error.message}`);
  });

  return buildkitdAddr;
}

/**
 * Prunes buildkit cache data older than 14 days.
 * We don't specify any keep bytes here since we are
 * handling the ceph volume size limits ourselves in
 * the VM Agent.
 * @throws Error if buildctl prune command fails
 */
export async function pruneBuildkitCache(): Promise<void> {
  try {
    const fourteenDaysInHours = 14 * 24;
    await execAsync(`sudo buildctl prune --keep-duration ${fourteenDaysInHours}h --all`);
    core.debug('Successfully pruned buildkit cache');
  } catch (error) {
    core.warning(`Error pruning buildkit cache: ${error.message}`);
    throw error;
  }
}

// stickyDiskTimeoutMs states the max amount of time this action will wait for the VM agent to
// expose the sticky disk from the storage agent, map it onto the host and then patch the drive
// into the VM.
const stickyDiskTimeoutMs = 45000;

// setupStickyDisk mounts a sticky disk for the entity and returns the device information.
// throws an error if it is unable to do so because of a timeout or an error
export async function setupStickyDisk(dockerfilePath: string): Promise<{device: string; buildId?: string | null; exposeId: string}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), stickyDiskTimeoutMs);

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

    // Check inode usage at mountpoint, and report if over 80%.
    try {
      const {stdout} = await execAsync(`df -i ${mountPoint} | tail -1 | awk '{print $5}' | sed 's/%//'`);
      const inodePercentage = parseInt(stdout.trim());
      if (!isNaN(inodePercentage) && inodePercentage > 80) {
        // Report if over 80%
        await reporter.reportBuildPushActionFailure(new Error(`High inode usage (${inodePercentage}%) detected at ${mountPoint}`), 'setupStickyDisk', true /* isWarning */);
        core.warning(`High inode usage (${inodePercentage}%) detected at ${mountPoint}`);
      }
    } catch (error) {
      core.debug(`Error checking inode usage: ${error.message}`);
    }
    return {device, buildId: buildResponse?.docker_build_id, exposeId: exposeId};
  } catch (error) {
    core.warning(`Error in setupStickyDisk: ${(error as Error).message}`);
    throw error;
  }
}
