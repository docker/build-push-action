import * as fs from 'fs';
import * as path from 'path';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';
import * as actionsToolkit from '@docker/actions-toolkit';

import {Buildx} from '@docker/actions-toolkit/lib/buildx/buildx';
import {History as BuildxHistory} from '@docker/actions-toolkit/lib/buildx/history';
import {Context} from '@docker/actions-toolkit/lib/context';
import {Docker} from '@docker/actions-toolkit/lib/docker/docker';
import {Exec} from '@docker/actions-toolkit/lib/exec';
import {GitHub} from '@docker/actions-toolkit/lib/github';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit';
import {Util} from '@docker/actions-toolkit/lib/util';

import {BuilderInfo} from '@docker/actions-toolkit/lib/types/buildx/builder';
import {ConfigFile} from '@docker/actions-toolkit/lib/types/docker/docker';
import {UploadArtifactResponse} from '@docker/actions-toolkit/lib/types/github';
import axios, {AxiosInstance} from 'axios';

import * as context from './context';

const buildxVersion = 'v0.17.0';

async function getBlacksmithHttpClient(): Promise<AxiosInstance> {
  return axios.create({
    baseURL: process.env.BUILDER_URL || 'https://staginganvil.blacksmith.sh/build_tasks',
    headers: {
      Authorization: `Bearer ${process.env.BLACKSMITH_ANVIL_TOKEN}`
    }
  });
}

async function reportBuildCompleted() {
  try {
    const client = await getBlacksmithHttpClient();
    const response = await client.post(`/${stateHelper.blacksmithBuildTaskId}/complete`);
    core.info(`Blacksmith builder ${stateHelper.blacksmithBuildTaskId} completed: ${JSON.stringify(response.data)}`);
  } catch (error) {
    core.warning('Error completing Blacksmith build:', error);
    throw error;
  }
}

async function reportBuildFailed() {
  try {
    const client = await getBlacksmithHttpClient();
    const response = await client.post(`/${stateHelper.blacksmithBuildTaskId}/fail`);
    core.info(`Docker build failed, tearing down Blacksmith builder for ${stateHelper.blacksmithBuildTaskId}: ${JSON.stringify(response.data)}`);
  } catch (error) {
    core.warning('Error completing Blacksmith build:', error);
    throw error;
  }
}

// getRemoteBuilderAddr resolves the address to a remote Docker builder.
// If it is unable to do so because of a timeout or an error it returns null.
async function getRemoteBuilderAddr(inputs: context.Inputs): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const client = await getBlacksmithHttpClient();
    const dockerfilePath = context.getDockerfilePath(inputs);
    let payload = {};
    if (dockerfilePath && dockerfilePath.length > 0) {
      payload = {dockerfile_path: dockerfilePath};
      core.info(`Using dockerfile path: ${dockerfilePath}`);
    }
    core.info(`Waiting for Blacksmith builder agent to be ready...`);
    const response = await client.post('', payload);

    const data = response.data;
    const taskId = data['id'] as string;
    stateHelper.setBlacksmithBuildTaskId(taskId);
    const clientKey = data['client_key'] as string;
    stateHelper.setBlacksmithClientKey(clientKey);
    const clientCaCertificate = data['client_ca_certificate'] as string;
    stateHelper.setBlacksmithClientCaCertificate(clientCaCertificate);
    const rootCaCertificate = data['root_ca_certificate'] as string;
    stateHelper.setBlacksmithRootCaCertificate(rootCaCertificate);

    const startTime = Date.now();
    while (Date.now() - startTime < 60000) {
      const response = await client.get(`/${taskId}`);
      const data = response.data;
      const ec2Instance = data['ec2_instance'] ?? null;
      if (ec2Instance) {
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        core.info(`Blacksmith builder agent ready after ${elapsedTime} seconds`);
        return `tcp://${ec2Instance['instance_ip']}:4242` as string;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    await client.post(`/${stateHelper.blacksmithBuildTaskId}/abandon`);
    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      core.warning('No builder instances were available, falling back to a local build');
    } else {
      core.warning(`Error in getBuildkitdAddr: ${error.message}`);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
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

    let remoteBuilderAddr: string | null = null;
    await core.group(`Starting Blacksmith remote builder`, async () => {
      remoteBuilderAddr = await getRemoteBuilderAddr(inputs);
      if (!remoteBuilderAddr) {
        core.warning('Failed to obtain Blacksmith remote builder address. Falling back to a local build.');
      }
    });

    if (remoteBuilderAddr) {
      await core.group(`Creating a remote builder instance`, async () => {
        const name = `blacksmith`;
        const createCmd = await toolkit.buildx.getCommand(await context.getRemoteBuilderArgs(name, remoteBuilderAddr!));
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
      // If we failed to obtain the address, let's check if we have an already configured builder.
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
      builder = await toolkit.builder.inspect(inputs.builder);
      core.info(JSON.stringify(builder, null, 2));
    });

    const args: string[] = await context.getArgs(inputs, toolkit);
    core.debug(`context.getArgs: ${JSON.stringify(args)}`);

    const buildCmd = await toolkit.buildx.getCommand(args);
    core.debug(`buildCmd.command: ${buildCmd.command}`);
    core.debug(`buildCmd.args: ${JSON.stringify(buildCmd.args)}`);

    let err: Error | undefined;
    await Exec.getExecOutput(buildCmd.command, buildCmd.args, {
      ignoreReturnCode: true,
      env: Object.assign({}, process.env, {
        BUILDX_METADATA_WARNINGS: 'true'
      }) as {
        [key: string]: string;
      }
    }).then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        err = Error(`buildx failed with: ${res.stderr.match(/(.*)\s*$/)?.[0]?.trim() ?? 'unknown error'}`);
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

    let ref: string | undefined;
    await core.group(`Reference`, async () => {
      ref = await buildRef(toolkit, startedTime, inputs.builder);
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

    if (err) {
      if (remoteBuilderAddr) {
        stateHelper.setRemoteDockerBuildStatus('failure');
      }
      throw err;
    }
    if (remoteBuilderAddr) {
      stateHelper.setRemoteDockerBuildStatus('success');
    }
  },
  // post
  async () => {
    if (stateHelper.isSummarySupported) {
      await core.group(`Generating build summary`, async () => {
        try {
          const recordUploadEnabled = buildRecordUploadEnabled();
          let recordRetentionDays: number | undefined;
          if (recordUploadEnabled) {
            recordRetentionDays = buildRecordRetentionDays();
          }

          const buildxHistory = new BuildxHistory();
          const exportRes = await buildxHistory.export({
            refs: stateHelper.buildRef ? [stateHelper.buildRef] : []
          });
          core.info(`Build record written to ${exportRes.dockerbuildFilename} (${Util.formatFileSize(exportRes.dockerbuildSize)})`);

          let uploadRes: UploadArtifactResponse | undefined;
          if (recordUploadEnabled) {
            uploadRes = await GitHub.uploadArtifact({
              filename: exportRes.dockerbuildFilename,
              mimeType: 'application/gzip',
              retentionDays: recordRetentionDays
            });
          }

          await GitHub.writeBuildSummary({
            exportRes: exportRes,
            uploadRes: uploadRes,
            inputs: stateHelper.inputs
          });
        } catch (e) {
          core.warning(e.message);
        }
      });
    }
    if (stateHelper.remoteDockerBuildStatus != '') {
      if (stateHelper.remoteDockerBuildStatus == 'success') {
        await reportBuildCompleted();
      } else {
        await reportBuildFailed();
      }
    }
    if (stateHelper.tmpDir.length > 0) {
      await core.group(`Removing temp folder ${stateHelper.tmpDir}`, async () => {
        fs.rmSync(stateHelper.tmpDir, {recursive: true});
      });
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

function buildRecordUploadEnabled(): boolean {
  if (process.env.DOCKER_BUILD_RECORD_UPLOAD) {
    return Util.parseBool(process.env.DOCKER_BUILD_RECORD_UPLOAD);
  }
  return true;
}

function buildRecordRetentionDays(): number | undefined {
  let val: string | undefined;
  if (process.env.DOCKER_BUILD_EXPORT_RETENTION_DAYS) {
    core.warning('DOCKER_BUILD_EXPORT_RETENTION_DAYS is deprecated. Use DOCKER_BUILD_RECORD_RETENTION_DAYS instead.');
    val = process.env.DOCKER_BUILD_EXPORT_RETENTION_DAYS;
  } else if (process.env.DOCKER_BUILD_RECORD_RETENTION_DAYS) {
    val = process.env.DOCKER_BUILD_RECORD_RETENTION_DAYS;
  }
  if (val) {
    const res = parseInt(val);
    if (isNaN(res)) {
      throw Error(`Invalid build record retention days: ${val}`);
    }
    return res;
  }
}
