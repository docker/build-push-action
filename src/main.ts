import * as fs from 'fs';
import * as path from 'path';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';
import * as actionsToolkit from '@docker/actions-toolkit';

import {Buildx} from '@docker/actions-toolkit/lib/buildx/buildx';
import {History as BuildxHistory} from '@docker/actions-toolkit/lib/buildx/history';
import {ExportRecordResponse} from '@docker/actions-toolkit/lib/types/buildx/history';
import {Context} from '@docker/actions-toolkit/lib/context';
import {Docker} from '@docker/actions-toolkit/lib/docker/docker';
import {Exec} from '@docker/actions-toolkit/lib/exec';
import {GitHub} from '@docker/actions-toolkit/lib/github';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit';
import {Util} from '@docker/actions-toolkit/lib/util';

import {BuilderInfo} from '@docker/actions-toolkit/lib/types/buildx/builder';
import {ConfigFile} from '@docker/actions-toolkit/lib/types/docker/docker';
import axios, {AxiosError, AxiosInstance, AxiosResponse} from 'axios';

import * as context from './context';
import {promisify} from 'util';
import {exec} from 'child_process';
import * as TOML from '@iarna/toml';

const buildxVersion = 'v0.17.0';
const mountPoint = '/var/lib/buildkit';
const execAsync = promisify(exec);

// Returns a client for the sticky disk manager on the agent on this host
async function getBlacksmithAgentClient(): Promise<AxiosInstance> {
  const stickyDiskMgrUrl = 'http://192.168.127.1:5556';
  return axios.create({
    baseURL: stickyDiskMgrUrl
  });
}

// Reports a successful build to the local sticky disk manager
async function reportBuildCompleted(exportRes?: ExportRecordResponse, blacksmithDockerBuildId?: string | null, buildRef?: string, dockerBuildDurationSeconds?: string, exposeId?: string) {
  if (!blacksmithDockerBuildId) {
    core.warning('No docker build ID found, skipping build completion report');
    return;
  }

  try {
    const client = await getBlacksmithAgentClient();
    const formData = new FormData();
    formData.append('shouldCommit', 'true');
    formData.append('vmID', process.env.VM_ID || '');
    formData.append('exposeID', exposeId || '');
    formData.append('stickyDiskKey', process.env.GITHUB_REPO_NAME || '');
    const retryCondition = (error: AxiosError) => {
      return error.response?.status ? error.response.status > 500 : false;
    };

    await postWithRetry(client, '/stickydisks', formData, retryCondition);

    // Report success to Blacksmith API
    const requestOptions = {
      docker_build_id: blacksmithDockerBuildId,
      conclusion: 'successful',
      runtime_seconds: dockerBuildDurationSeconds
    };

    if (exportRes) {
      let buildRefSummary;
      // Extract just the ref ID from the full buildRef path
      const refId = buildRef?.split('/').pop();
      core.info(`Using buildRef ID: ${refId}`);
      if (refId && exportRes.summaries[refId]) {
        buildRefSummary = exportRes.summaries[refId];
      } else {
        // Take first summary if buildRef not found
        const summaryKeys = Object.keys(exportRes.summaries);
        if (summaryKeys.length > 0) {
          buildRefSummary = exportRes.summaries[summaryKeys[0]];
        }
      }

      if (buildRefSummary) {
        const cachedRatio = buildRefSummary.numCachedSteps / buildRefSummary.numTotalSteps;
        requestOptions['cached_steps_ratio'] = cachedRatio;
      }
    }

    await postWithRetryToBlacksmithAPI(`/stickydisks/dockerbuilds/${blacksmithDockerBuildId}`, requestOptions, retryCondition);
    return;
  } catch (error) {
    core.warning('Error reporting build completed:', error);
    // We don't want to fail the build if this fails so we swallow the error
  }
}

// Reports a failed build to both the local sticky disk manager and the Blacksmith API
async function reportBuildFailed(dockerBuildId: string | null, dockerBuildDurationSeconds?: string, exposeId?: string | null) {
  if (!dockerBuildId) {
    core.warning('No docker build ID found, skipping build completion report');
    return;
  }

  try {
    const client = await getBlacksmithAgentClient();
    const formData = new FormData();
    formData.append('shouldCommit', 'false');
    formData.append('vmID', process.env.VM_ID || '');
    formData.append('exposeID', exposeId || '');
    formData.append('stickyDiskKey', process.env.GITHUB_REPO_NAME || '');
    const retryCondition = (error: AxiosError) => {
      return error.response?.status ? error.response.status > 500 : false;
    };

    await postWithRetry(client, '/stickydisks', formData, retryCondition);

    // Report failure to Blacksmith API
    const requestOptions = {
      docker_build_id: dockerBuildId,
      conclusion: 'failed',
      runtime_seconds: dockerBuildDurationSeconds
    };

    await postWithRetryToBlacksmithAPI(`/stickydisks/dockerbuilds/${dockerBuildId}`, requestOptions, retryCondition);
    return;
  } catch (error) {
    core.warning('Error reporting build failed:', error);
    // We don't want to fail the build if this fails so we swallow the error
  }
}

async function postWithRetryToBlacksmithAPI(url: string, requestBody: unknown, retryCondition: (error: AxiosError) => boolean): Promise<AxiosResponse> {
  const maxRetries = 5;
  const retryDelay = 100;
  const apiUrl = process.env.BLACKSMITH_ENV?.includes('staging') ? 'https://stagingapi.blacksmith.sh' : 'https://api.blacksmith.sh';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      core.debug(`Request headers: Authorization: Bearer ${process.env.BLACKSMITH_STICKYDISK_TOKEN}, X-Github-Repo-Name: ${process.env.GITHUB_REPO_NAME || ''}`);

      const fullUrl = `${apiUrl}${url}`;
      core.debug(`Making request to full URL: ${fullUrl}`);

      return await axios.post(fullUrl, requestBody, {
        headers: {
          Authorization: `Bearer ${process.env.BLACKSMITH_STICKYDISK_TOKEN}`,
          'X-Github-Repo-Name': process.env.GITHUB_REPO_NAME || '',
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      if (attempt === maxRetries || !retryCondition(error as AxiosError)) {
        throw error;
      }
      core.warning(`Request failed, retrying (${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  throw new Error('Max retries reached');
}

async function postWithRetry(client: AxiosInstance, url: string, formData: FormData, retryCondition: (error: AxiosError) => boolean): Promise<AxiosResponse> {
  const maxRetries = 5;
  const retryDelay = 100;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.post(url, formData, {
        headers: {
          Authorization: `Bearer ${process.env.BLACKSMITH_STICKYDISK_TOKEN}`,
          'X-Github-Repo-Name': process.env.GITHUB_REPO_NAME || '',
          'Content-Type': 'multipart/form-data'
        }
      });
    } catch (error) {
      if (attempt === maxRetries || !retryCondition(error as AxiosError)) {
        throw error;
      }
      core.warning(`Request failed, retrying (${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  throw new Error('Max retries reached');
}

async function getWithRetry(client: AxiosInstance, url: string, formData: FormData | null, retryCondition: (error: AxiosError) => boolean, options?: {signal?: AbortSignal}): Promise<AxiosResponse> {
  const maxRetries = 5;
  const retryDelay = 100;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (formData) {
        return await client.get(url, {
          data: formData,
          headers: {
            Authorization: `Bearer ${process.env.BLACKSMITH_STICKYDISK_TOKEN}`,
            'X-Github-Repo-Name': process.env.GITHUB_REPO_NAME || '',
            'Content-Type': 'multipart/form-data'
          },
          signal: options?.signal
        });
      }
      return await client.get(url, {signal: options?.signal});
    } catch (error) {
      if (attempt === maxRetries || !retryCondition(error as AxiosError)) {
        throw error;
      }
      core.warning(`Request failed, retrying (${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  throw new Error('Max retries reached');
}

async function getStickyDisk(retryCondition: (error: AxiosError) => boolean, options?: {signal?: AbortSignal}): Promise<{expose_id: string; device: string}> {
  const client = await getBlacksmithAgentClient();
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
  const response = await getWithRetry(client, '/stickydisks', formData, retryCondition, options);
  // For backward compatibility, if expose_id is set, return it
  if (response.data?.expose_id && response.data?.disk_identifier) {
    return {expose_id: response.data.expose_id, device: response.data.disk_identifier};
  }
  return {expose_id: '', device: ''};
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

// Function to gracefully shut down the buildkitd process
async function shutdownBuildkitd(): Promise<void> {
  try {
    await execAsync(`sudo pkill -TERM buildkitd`);
  } catch (error) {
    core.error('error shutting down buildkitd process:', error);
    throw error;
  }
}

// Function to get the number of available CPUs
async function getNumCPUs(): Promise<number> {
  try {
    const {stdout} = await execAsync('sudo nproc');
    return parseInt(stdout.trim());
  } catch (error) {
    core.warning('Failed to get CPU count, defaulting to 1:', error);
    return 1;
  }
}
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

// reportBuild reports the build to the Blacksmith API and returns the build ID
async function reportBuild(dockerfilePath: string) {
  try {
    const requestBody = {
      dockerfile_path: dockerfilePath,
      repo_name: process.env.GITHUB_REPO_NAME || '',
      region: process.env.BLACKSMITH_REGION || 'eu-central',
      arch: process.env.BLACKSMITH_ENV?.includes('arm') ? 'arm64' : 'amd64',
      git_sha: process.env.GITHUB_SHA || '',
      vm_id: process.env.VM_ID || '',
      git_branch: process.env.GITHUB_REF_NAME || ''
    };
    core.debug(`Reporting build with options: ${JSON.stringify(requestBody, null, 2)}`);
    const retryCondition = (error: AxiosError) => {
      return error.response?.status ? error.response.status > 500 : false;
    };
    const response = await postWithRetryToBlacksmithAPI('/stickydisks/dockerbuilds', requestBody, retryCondition);
    stateHelper.setBlacksmithDockerBuildId(response.data.docker_build_id);
    return response.data;
  } catch (error) {
    const statusCode = (error as AxiosError)?.response?.status;
    core.warning(`Error reporting build to Blacksmith API (status: ${statusCode || 'unknown'}):`);
    core.warning(error);
    return null;
  }
}

async function reportBuilderCreationFailed() {
  const requestOptions = {
    stickydisk_key: process.env.GITHUB_REPO_NAME || '',
    repo_name: process.env.GITHUB_REPO_NAME || '',
    region: process.env.BLACKSMITH_REGION || 'eu-central',
    arch: process.env.BLACKSMITH_ENV?.includes('arm') ? 'arm64' : 'amd64',
    vm_id: process.env.VM_ID || '',
    petname: process.env.PETNAME || ''
  };
  const retryCondition = (error: AxiosError) => {
    return error.response?.status ? error.response.status > 500 : false;
  };
  const response = await postWithRetryToBlacksmithAPI('/stickydisks/report-failed', requestOptions, retryCondition);
  return response.data;
}

// getBuilderAddr mounts a sticky disk for the entity, sets up buildkitd on top of it
// and returns the address to the builder.
// If it is unable to do so because of a timeout or an error it returns null.
async function getBuilderAddr(inputs: context.Inputs, dockerfilePath: string): Promise<{addr: string | null; buildId?: string | null; exposeId: string}> {
  try {
    const retryCondition = (error: AxiosError) => (error.response?.status ? error.response.status >= 500 : error.code === 'ECONNRESET');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let buildResponse: {docker_build_id: string} | null = null;
    let exposeId: string = '';
    let device: string = '';
    try {
      const stickyDiskResponse = await getStickyDisk(retryCondition, {signal: controller.signal});
      exposeId = stickyDiskResponse.expose_id;
      device = stickyDiskResponse.device;
      if (device === '') {
        // TODO(adityamaru): Remove this once all of our VM agents are returning the device in the stickydisk response.
        device = '/dev/vdb';
      }
      clearTimeout(timeoutId);
      await maybeFormatBlockDevice(device);
      buildResponse = await reportBuild(dockerfilePath);
      await execAsync(`sudo mkdir -p ${mountPoint}`);
      await execAsync(`sudo mount ${device} ${mountPoint}`);
      core.debug(`${device} has been mounted to ${mountPoint}`);
    } catch (error) {
      if (error.name === 'AbortError') {
        return {addr: null, exposeId: ''};
      }
      throw error;
    }

    core.debug('Successfully obtained sticky disk, proceeding to start buildkitd');

    // Start buildkitd.
    const parallelism = await getNumCPUs();
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
    return {addr: buildkitdAddr, buildId: buildResponse?.docker_build_id, exposeId: exposeId};
  } catch (error) {
    if ((error as AxiosError).response && (error as AxiosError).response!.status === 404) {
      if (!inputs.nofallback) {
        core.warning('No builder instances were available, falling back to a local build');
      }
    } else {
      core.warning(`Error in getBuildkitdAddr: ${(error as Error).message}`);
    }
    return {addr: null, exposeId: ''};
  }
}

async function setupBuildx(version: string, toolkit: Toolkit): Promise<void> {
  let toolPath;
  const standalone = await toolkit.buildx.isStandalone();

  if (!(await toolkit.buildx.isAvailable()) || version) {
    await core.group(`Download buildx from GitHub Releases`, async () => {
      toolPath = await toolkit.buildxInstall.download(version || 'latest', true);
    });
  }

  if (toolPath) {
    await core.group(`Install buildx`, async () => {
      if (standalone) {
        await toolkit.buildxInstall.installStandalone(toolPath);
      } else {
        await toolkit.buildxInstall.installPlugin(toolPath);
      }
    });
  }

  await core.group(`Buildx version`, async () => {
    await toolkit.buildx.printVersion();
  });
}

actionsToolkit.run(
  // main
  async () => {
    const startedTime = new Date();
    const inputs: context.Inputs = await context.getInputs();
    stateHelper.setInputs(inputs);

    const toolkit = new Toolkit();

    await core.group(`GitHub Actions runtime token ACs`, async () => {
      try {
        await GitHub.printActionsRuntimeTokenACs();
      } catch (e) {
        core.warning(e.message);
      }
    });

    await core.group(`Docker info`, async () => {
      try {
        await Docker.printVersion();
        await Docker.printInfo();
      } catch (e) {
        core.info(e.message);
      }
    });

    await core.group(`Setup buildx`, async () => {
      await setupBuildx(buildxVersion, toolkit);

      if (!(await toolkit.buildx.isAvailable())) {
        core.setFailed(`Docker buildx is required. See https://github.com/docker/setup-buildx-action to set up buildx.`);
        return;
      }
    });

    let builderInfo = {
      addr: null as string | null,
      buildId: null as string | null,
      exposeId: '' as string
    };
    await core.group(`Starting Blacksmith builder`, async () => {
      const dockerfilePath = context.getDockerfilePath(inputs);
      if (!dockerfilePath) {
        if (inputs.nofallback) {
          await reportBuilderCreationFailed();
          throw Error('Failed to resolve dockerfile path, and fallback is disabled');
        } else {
          core.warning('Failed to resolve dockerfile path, and fallback is enabled. Falling back to a local build.');
        }
        return;
      }
      if (dockerfilePath && dockerfilePath.length > 0) {
        core.debug(`Using dockerfile path: ${dockerfilePath}`);
      }
      const {addr, buildId, exposeId} = await getBuilderAddr(inputs, dockerfilePath);
      builderInfo = {
        addr: addr || null,
        buildId: buildId || null,
        exposeId: exposeId
      };
      if (!builderInfo.addr) {
        await reportBuilderCreationFailed();
        if (inputs.nofallback) {
          throw Error('Failed to obtain Blacksmith builder. Failing the build');
        } else {
          core.warning('Failed to obtain Blacksmith builder address. Falling back to a local build.');
        }
      }
    });

    let buildError: Error | undefined;
    let buildDurationSeconds: string | undefined;
    let ref: string | undefined;
    try {
      if (builderInfo.addr) {
        await core.group(`Creating a builder instance`, async () => {
          const name = `blacksmith-${Date.now().toString(36)}`;
          const createCmd = await toolkit.buildx.getCommand(await context.getRemoteBuilderArgs(name, builderInfo.addr!));
          core.info(`Creating builder with command: ${createCmd.command}`);
          await Exec.getExecOutput(createCmd.command, createCmd.args, {
            ignoreReturnCode: true
          }).then(res => {
            if (res.stderr.length > 0 && res.exitCode != 0) {
              throw new Error(res.stderr.match(/(.*)\s*$/)?.[0]?.trim() ?? 'unknown error');
            }
          });
        });
      } else {
        await core.group(`Checking for configured builder`, async () => {
          try {
            const builder = await toolkit.builder.inspect();
            if (builder) {
              core.info(`Found configured builder: ${builder.name}`);
            } else {
              // Create a local builder using the docker-container driver (which is the default driver in setup-buildx)
              const createLocalBuilderCmd = 'docker buildx create --name local --driver docker-container --use';
              try {
                await Exec.exec(createLocalBuilderCmd);
                core.info('Created and set a local builder for use');
              } catch (error) {
                core.setFailed(`Failed to create local builder: ${error.message}`);
              }
            }
          } catch (error) {
            core.setFailed(`Error configuring builder: ${error.message}`);
          }
        });
      }

      await core.group(`Proxy configuration`, async () => {
        let dockerConfig: ConfigFile | undefined;
        let dockerConfigMalformed = false;
        try {
          dockerConfig = await Docker.configFile();
        } catch (e) {
          dockerConfigMalformed = true;
          core.warning(`Unable to parse config file ${path.join(Docker.configDir, 'config.json')}: ${e}`);
        }
        if (dockerConfig && dockerConfig.proxies) {
          for (const host in dockerConfig.proxies) {
            let prefix = '';
            if (Object.keys(dockerConfig.proxies).length > 1) {
              prefix = '  ';
              core.info(host);
            }
            for (const key in dockerConfig.proxies[host]) {
              core.info(`${prefix}${key}: ${dockerConfig.proxies[host][key]}`);
            }
          }
        } else if (!dockerConfigMalformed) {
          core.info('No proxy configuration found');
        }
      });

      stateHelper.setTmpDir(Context.tmpDir());

      let builder: BuilderInfo;
      await core.group(`Builder info`, async () => {
        builder = await toolkit.builder.inspect();
        core.info(JSON.stringify(builder, null, 2));
      });

      const args: string[] = await context.getArgs(inputs, toolkit);
      args.push('--debug');
      core.debug(`context.getArgs: ${JSON.stringify(args)}`);

      const buildCmd = await toolkit.buildx.getCommand(args);

      core.debug(`buildCmd.command: ${buildCmd.command}`);
      core.debug(`buildCmd.args: ${JSON.stringify(buildCmd.args)}`);

      const buildStartTime = Date.now();
      await Exec.getExecOutput(buildCmd.command, buildCmd.args, {
        ignoreReturnCode: true,
        env: Object.assign({}, process.env, {
          BUILDX_METADATA_WARNINGS: 'true'
        }) as {
          [key: string]: string;
        }
      }).then(res => {
        buildDurationSeconds = Math.round((Date.now() - buildStartTime) / 1000).toString();
        stateHelper.setDockerBuildDurationSeconds(buildDurationSeconds);
        if (res.stderr.length > 0 && res.exitCode != 0) {
          throw Error(`buildx failed with: ${res.stderr.match(/(.*)\s*$/)?.[0]?.trim() ?? 'unknown error'}`);
        }
      });

      const imageID = toolkit.buildxBuild.resolveImageID();
      const metadata = toolkit.buildxBuild.resolveMetadata();
      const digest = toolkit.buildxBuild.resolveDigest(metadata);
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
          const metadatadt = JSON.stringify(metadata, null, 2);
          core.info(metadatadt);
          core.setOutput('metadata', metadatadt);
        });
      }

      await core.group(`Reference`, async () => {
        ref = await buildRef(toolkit, startedTime, builder.name);
        if (ref) {
          core.info(ref);
          stateHelper.setBuildRef(ref);
        } else {
          core.info('No build reference found');
        }
      });

      if (buildChecksAnnotationsEnabled()) {
        const warnings = toolkit.buildxBuild.resolveWarnings(metadata);
        if (ref && warnings && warnings.length > 0) {
          const annotations = await Buildx.convertWarningsToGitHubAnnotations(warnings, [ref]);
          core.debug(`annotations: ${JSON.stringify(annotations, null, 2)}`);
          if (annotations && annotations.length > 0) {
            await core.group(`Generating GitHub annotations (${annotations.length} build checks found)`, async () => {
              for (const annotation of annotations) {
                core.warning(annotation.message, annotation);
              }
            });
          }
        }
      }

      await core.group(`Check build summary support`, async () => {
        if (!buildSummaryEnabled()) {
          core.info('Build summary disabled');
        } else if (GitHub.isGHES) {
          core.info('Build summary is not yet supported on GHES');
        } else if (!(await toolkit.buildx.versionSatisfies('>=0.13.0'))) {
          core.info('Build summary requires Buildx >= 0.13.0');
        } else if (builder && builder.driver === 'cloud') {
          core.info('Build summary is not yet supported with Docker Build Cloud');
        } else if (!ref) {
          core.info('Build summary requires a build reference');
        } else {
          core.info('Build summary supported!');
          stateHelper.setSummarySupported();
        }
      });
    } catch (error) {
      buildError = error as Error;
    }

    await core.group('Cleaning up Blacksmith builder', async () => {
      if (builderInfo.addr) {
        try {
          let exportRes;
          if (!buildError) {
            const buildxHistory = new BuildxHistory();
            exportRes = await buildxHistory.export({
              refs: ref ? [ref] : []
            });
          }
          await shutdownBuildkitd();
          core.info('Shutdown buildkitd');
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await execAsync(`sudo umount ${mountPoint}`);
              core.debug(`${mountPoint} has been unmounted`);
              break;
            } catch (error) {
              if (attempt === 3) {
                throw error;
              }
              core.warning(`Unmount failed, retrying (${attempt}/3)...`);
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          core.info('Unmounted device');
          if (!buildError) {
            await reportBuildCompleted(exportRes, builderInfo.buildId, ref, buildDurationSeconds, builderInfo.exposeId);
          } else {
            try {
              const buildkitdLog = fs.readFileSync('buildkitd.log', 'utf8');
              core.info('buildkitd.log contents:');
              core.info(buildkitdLog);
            } catch (error) {
              core.warning(`Failed to read buildkitd.log: ${error.message}`);
            }
            await reportBuildFailed(builderInfo.buildId, buildDurationSeconds, builderInfo.exposeId);
          }
        } catch (error) {
          core.warning(`Error during Blacksmith builder shutdown: ${error.message}`);
        }
      }
    });

    // Re-throw the error after cleanup
    if (buildError) {
      throw buildError;
    }
  },
  // post
  async () => {
    if (stateHelper.tmpDir.length > 0) {
      await core.group(`Removing temp folder ${stateHelper.tmpDir}`, async () => {
        fs.rmSync(stateHelper.tmpDir, {recursive: true});
      });
    }
    // Check for any lingering buildkitd processes as a safeguard.
    // TODO(adityamaru): Let's add an endpoint to sentry alert on this cause this
    // means we've not handled some error throws in the main action.
    try {
      const {stdout} = await execAsync('pgrep buildkitd');
      if (stdout) {
        core.info('Found lingering buildkitd processes, cleaning up...');
        await shutdownBuildkitd();
        core.info('Shutdown buildkitd');

        // Try to unmount if mounted
        try {
          const {stdout: mountOutput} = await execAsync(`mount | grep ${mountPoint}`);
          if (mountOutput) {
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                await execAsync(`sudo umount ${mountPoint}`);
                core.debug(`${mountPoint} has been unmounted`);
                break;
              } catch (error) {
                if (attempt === 3) {
                  throw error;
                }
                core.warning(`Unmount failed, retrying (${attempt}/3)...`);
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
            core.info('Unmounted device');
          }
        } catch (error) {
          core.warning(`Error during cleanup: ${error.message}`);
        }
      }
    } catch (error) {
      // pgrep returns non-zero if no processes found, which is fine.
      core.debug('No lingering buildkitd processes found');
    }
  }
);

async function buildRef(toolkit: Toolkit, since: Date, builder?: string): Promise<string> {
  // get ref from metadata file
  const ref = toolkit.buildxBuild.resolveRef();
  if (ref) {
    return ref;
  }
  // otherwise, look for the very first build ref since the build has started
  if (!builder) {
    const currentBuilder = await toolkit.builder.inspect();
    builder = currentBuilder.name;
  }
  const refs = Buildx.refs({
    dir: Buildx.refsDir,
    builderName: builder,
    since: since
  });
  return Object.keys(refs).length > 0 ? Object.keys(refs)[0] : '';
}

function buildChecksAnnotationsEnabled(): boolean {
  if (process.env.DOCKER_BUILD_CHECKS_ANNOTATIONS) {
    return Util.parseBool(process.env.DOCKER_BUILD_CHECKS_ANNOTATIONS);
  }
  return true;
}

function buildSummaryEnabled(): boolean {
  if (process.env.DOCKER_BUILD_NO_SUMMARY) {
    core.warning('DOCKER_BUILD_NO_SUMMARY is deprecated. Set DOCKER_BUILD_SUMMARY to false instead.');
    return !Util.parseBool(process.env.DOCKER_BUILD_NO_SUMMARY);
  } else if (process.env.DOCKER_BUILD_SUMMARY) {
    return Util.parseBool(process.env.DOCKER_BUILD_SUMMARY);
  }
  return true;
}
