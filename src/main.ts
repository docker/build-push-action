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
import * as reporter from './reporter';
import {reportBuildStart} from './build-reporter';
import {Metric_MetricType} from '@buf/blacksmith_vm-agent.bufbuild_es/stickydisk/v1/stickydisk_pb';

const DEFAULT_BUILDX_VERSION = 'v0.23.0';

async function retryWithBackoff<T>(operation: () => Promise<T>, maxRetries: number = 5, initialBackoffMs: number = 200): Promise<T> {
  let lastError: Error = new Error('No error occurred');
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error.message?.includes('429') || error.status === 429) {
        if (attempt < maxRetries - 1) {
          const backoffMs = initialBackoffMs * Math.pow(2, attempt);
          core.info(`Rate limited (429). Retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
}

async function setupBuildx(version: string, toolkit: Toolkit): Promise<void> {
  let toolPath;
  const standalone = await toolkit.buildx.isStandalone();

  if (!(await toolkit.buildx.isAvailable()) || version) {
    await core.group(`Download buildx from GitHub Releases`, async () => {
      toolPath = await retryWithBackoff(() => toolkit.buildxInstall.download(version || 'latest', true));
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

// Validates the version string to ensure it matches a basic expected pattern.
// Accepts versions of the form `v<MAJOR>.<MINOR>.<PATCH>` (e.g., v0.20.0) or the literal string `latest`.
function isValidBuildxVersion(version: string): boolean {
  return version === 'latest' || /^v\d+\.\d+\.\d+$/.test(version);
}

/**
 * Reports the build start to the backend and gets a build ID for tracking.
 *
 * @param inputs - Configuration inputs
 * @returns {string|null} buildId - ID used to track build progress and report metrics
 */
export async function reportBuildMetrics(inputs: context.Inputs): Promise<string | null> {
  try {
    // Get the dockerfile path to report the build to our control plane.
    const dockerfilePath = context.getDockerfilePath(inputs);
    if (!dockerfilePath) {
      throw new Error('Failed to resolve dockerfile path');
    }
    
    // Report build start to get a build ID for tracking
    const buildInfo = await reportBuildStart(dockerfilePath);
    return buildInfo?.docker_build_id || null;
  } catch (error) {
    await reporter.reportBuildPushActionFailure(error, 'reporting build metrics');
    core.warning(`Error during build metrics reporting: ${error.message}`);
    return null;
  }
}

actionsToolkit.run(
  // main
  async () => {
    await reporter.reportMetric(Metric_MetricType.BPA_FEATURE_USAGE, 1);
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

    // Determine which Buildx version to install. If the user provided an input, validate it;
    // otherwise, fall back to the default.
    let buildxVersion = DEFAULT_BUILDX_VERSION;
    if (inputs['buildx-version'] && inputs['buildx-version'].trim() !== '') {
      if (isValidBuildxVersion(inputs['buildx-version'])) {
        buildxVersion = inputs['buildx-version'];
      } else {
        core.warning(`Invalid buildx-version '${inputs['buildx-version']}'. ` + `Expected 'latest' or a version in the form v<MAJOR>.<MINOR>.<PATCH>. ` + `Falling back to default ${DEFAULT_BUILDX_VERSION}.`);
      }
    }

    await core.group(`Setup buildx`, async () => {
      await setupBuildx(buildxVersion, toolkit);

      if (!(await toolkit.buildx.isAvailable())) {
        core.setFailed(`Docker buildx is required. See https://github.com/docker/setup-buildx-action to set up buildx.`);
        return;
      }
    });

    let buildId: string | null = null;
    let buildError: Error | undefined;
    let buildDurationSeconds: string | undefined;
    let ref: string | undefined;
    try {
      await core.group(`Setting up build metrics tracking`, async () => {
        buildId = await reportBuildMetrics(inputs);
      });

      // Check that a builder is available (either from setup-docker-builder or existing)
      await core.group(`Checking for configured builder`, async () => {
        try {
          const builder = await toolkit.builder.inspect();
          if (builder) {
            core.info(`Found configured builder: ${builder.name}`);
          } else {
            core.setFailed(`No Docker builder found. Please use setup-docker-builder action or configure a builder before using build-push-action.`);
          }
        } catch (error) {
          core.setFailed(`Error checking for builder: ${error.message}`);
        }
      });

      // The sentinel file should already exist from setup-docker-builder

      let builder: BuilderInfo;
      await core.group(`Builder info`, async () => {
        builder = await toolkit.builder.inspect();
        core.info(JSON.stringify(builder, null, 2));
      });


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
      try {
        let exportRes;
        if (!buildError) {
          const buildxHistory = new BuildxHistory();
          exportRes = await buildxHistory.export({
            refs: ref ? [ref] : []
          });
        }

        // Buildkitd is now managed by setup-docker-builder, not here

        // Sticky disk is now managed by setup-docker-builder, not here

        if (buildId) {
          if (!buildError) {
            await reporter.reportBuildCompleted(exportRes, buildId, ref, buildDurationSeconds);
          } else {
            await reporter.reportBuildFailed(buildId, buildDurationSeconds);
          }
        }
      } catch (error) {
        core.warning(`Error during Blacksmith builder shutdown: ${error.message}`);
        await reporter.reportBuildPushActionFailure(error, 'shutting down blacksmith builder');
      } finally {
        // Buildkitd logs are managed by setup-docker-builder
      }
    });

    // Re-throw the error after cleanup
    if (buildError) {
      throw buildError;
    }
  },
  // post
  async () => {
    await core.group('Final cleanup', async () => {
      try {

        // Buildkitd is now managed by setup-docker-builder, not here
        // Sticky disk is also managed by setup-docker-builder, not here

        // Clean up temp directory if it exists.
        if (stateHelper.tmpDir.length > 0) {
          fs.rmSync(stateHelper.tmpDir, {recursive: true});
          core.debug(`Removed temp folder ${stateHelper.tmpDir}`);
        }
      } catch (error) {
        core.warning(`Error during final cleanup: ${error.message}`);
        await reporter.reportBuildPushActionFailure(error, 'final cleanup');
      }
    });
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

