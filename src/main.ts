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

import * as context from './context';
import {promisify} from 'util';
import {exec} from 'child_process';
import * as reporter from './reporter';
import {setupStickyDisk, startAndConfigureBuildkitd, getNumCPUs} from './setup_builder';

const buildxVersion = 'v0.17.0';
const mountPoint = '/var/lib/buildkit';
const execAsync = promisify(exec);

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

/**
 * Attempts to set up a Blacksmith builder for Docker builds.
 *
 * @param inputs - Configuration inputs including the nofallback flag
 * @returns {Object} Builder configuration
 * @returns {string|null} addr - The buildkit socket address if setup succeeded, null if using local build
 * @returns {string|null} buildId - ID used to track build progress and report metrics
 * @returns {string} exposeId - ID used to track and cleanup sticky disk resources
 *
 * The addr is used to configure the Docker buildx builder instance.
 * The buildId is used for build progress tracking and metrics reporting.
 * The exposeId is used during cleanup to ensure proper resource cleanup of sticky disks.
 *
 * Throws an error if setup fails and nofallback is false.
 * Returns null values if setup fails and nofallback is true.
 */
export async function startBlacksmithBuilder(inputs: context.Inputs): Promise<{addr: string | null; buildId: string | null; exposeId: string}> {
  try {
    const dockerfilePath = context.getDockerfilePath(inputs);
    if (!dockerfilePath) {
      throw new Error('Failed to resolve dockerfile path');
    }
    const stickyDiskSetup = await setupStickyDisk(dockerfilePath);
    const parallelism = await getNumCPUs();
    const buildkitdAddr = await startAndConfigureBuildkitd(parallelism, stickyDiskSetup.device);

    return {addr: buildkitdAddr, buildId: stickyDiskSetup.buildId || null, exposeId: stickyDiskSetup.exposeId};
  } catch (error) {
    // If the builder setup fails for any reason, we check if we should fallback to a local build.
    // If we should not fallback, we rethrow the error and fail the build.
    await reporter.reportBuildPushActionFailure(error);

    let errorMessage = `Error during Blacksmith builder setup: ${error.message}`;
    if (error.message.includes('buildkitd')) {
      errorMessage = `Error during buildkitd setup: ${error.message}`;
    }
    if (inputs.nofallback) {
      core.warning(`${errorMessage}. Failing the build because nofallback is set.`);
      throw error;
    }

    core.warning(`${errorMessage}. Falling back to a local build.`);
    return {addr: null, buildId: null, exposeId: ''};
  }
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
      builderInfo = await startBlacksmithBuilder(inputs);
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
          for (let attempt = 1; attempt <= 10; attempt++) {
            try {
              await execAsync(`sudo umount ${mountPoint}`);
              core.debug(`${mountPoint} has been unmounted`);
              break;
            } catch (error) {
              if (attempt === 10) {
                throw error;
              }
              core.warning(`Unmount failed, retrying (${attempt}/10)...`);
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
          core.info('Unmounted device');
          if (!buildError) {
            await reporter.reportBuildCompleted(exportRes, builderInfo.buildId, ref, buildDurationSeconds, builderInfo.exposeId);
          } else {
            try {
              const buildkitdLog = fs.readFileSync('buildkitd.log', 'utf8');
              core.info('buildkitd.log contents:');
              core.info(buildkitdLog);
            } catch (error) {
              core.warning(`Failed to read buildkitd.log: ${error.message}`);
            }
            await reporter.reportBuildFailed(builderInfo.buildId, buildDurationSeconds, builderInfo.exposeId);
          }
        } catch (error) {
          core.warning(`Error during Blacksmith builder shutdown: ${error.message}`);
          await reporter.reportBuildPushActionFailure(error);
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
    // Check for any lingering buildkitd processes and try to clean up mounts
    try {
      // Check for buildkitd processes first
      try {
        const {stdout} = await execAsync('pgrep buildkitd');
        if (stdout) {
          core.info('Found lingering buildkitd processes, cleaning up...');
          await shutdownBuildkitd();
          core.info('Shutdown buildkitd');
        }
      } catch (error) {
        // pgrep returns non-zero if no processes found, which is fine
        core.debug('No lingering buildkitd processes found');
      }

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
        // Only log warning if error is not from grep finding no mounts
        if (!error.message.includes('exit code 1')) {
          core.warning(`Error during cleanup: ${error.message}`);
        }
      }
    } catch (error) {
      core.warning(`Error during final cleanup: ${error.message}`);
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

export async function shutdownBuildkitd(): Promise<void> {
  try {
    await execAsync(`sudo pkill -TERM buildkitd`);
  } catch (error) {
    core.error('error shutting down buildkitd process:', error);
    throw error;
  }
}
