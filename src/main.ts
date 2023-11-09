import * as fs from 'fs';
import * as path from 'path';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';
import * as io from '@actions/io';
import * as actionsToolkit from '@docker/actions-toolkit';
import {Context} from '@docker/actions-toolkit/lib/context';
import {Docker} from '@docker/actions-toolkit/lib/docker/docker';
import {Exec} from '@docker/actions-toolkit/lib/exec';
import {GitHub} from '@docker/actions-toolkit/lib/github';
import {Inputs as BuildxInputs} from '@docker/actions-toolkit/lib/buildx/inputs';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit';
import {ConfigFile} from '@docker/actions-toolkit/lib/types/docker';

import * as context from './context';

actionsToolkit.run(
  // main
  async () => {
    const inputs: context.Inputs = await context.getInputs();
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

    if (!(await toolkit.buildx.isAvailable())) {
      core.setFailed(`Docker buildx is required. See https://github.com/docker/setup-buildx-action to set up buildx.`);
      return;
    }

    stateHelper.setTmpDir(Context.tmpDir());

    await core.group(`Buildx version`, async () => {
      await toolkit.buildx.printVersion();
    });

    const args: string[] = await context.getArgs(inputs, toolkit);
    const buildCmd = await toolkit.buildx.getCommand(args);
    await Exec.getExecOutput(buildCmd.command, buildCmd.args, {
      ignoreReturnCode: true
    }).then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(`buildx failed with: ${res.stderr.match(/(.*)\s*$/)?.[0]?.trim() ?? 'unknown error'}`);
      }
    });

    const imageID = BuildxInputs.resolveBuildImageID();
    const metadata = BuildxInputs.resolveBuildMetadata();
    const digest = BuildxInputs.resolveDigest();

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
        core.info(metadata);
        core.setOutput('metadata', metadata);
      });
    }

    if (inputs.sign) {
      // TODO: Check if `id-token: write` is specified and ID token is available.

      // Check if cosign is installed.
      const cosignAvailable = await io
        .which('cosign', true)
        .then(res => {
          core.debug(`cosignAvailable ok: ${res}`);
          return true;
        })
        .catch(error => {
          core.debug(`cosignAvailable error: ${error}`);
          return false;
        });
      if (!cosignAvailable) {
        core.setFailed(`Cosign is required to sign. See https://github.com/sigstore/cosign-installer to set up cosign.`);
        return;
      }

      await core.group(`Cosign version`, async () => {
        await Exec.getExecOutput('cosign', ['version'], {
          ignoreReturnCode: true
        }).then(res => {
          if (res.stderr.length > 0 && res.exitCode != 0) {
            throw new Error(`cosign version failed with: ${res.stderr.match(/(.*)\s*$/)?.[0]?.trim() ?? 'unknown error'}`);
          }
        });
      });

      if (!digest) {
        throw new Error('Digest is required to sign.');
      }

      for (const img of inputs.tags) {
        const ref = `${img}@${digest}`;
        await core.group(`Signing image ${ref}`, async () => {
          // TODO: Annotate with workflow run ID, etc, from env vars.
          await Exec.exec('cosign', ['sign', ref, '--yes']);
        });
      }
    }
  },
  // post
  async () => {
    if (stateHelper.tmpDir.length > 0) {
      await core.group(`Removing temp folder ${stateHelper.tmpDir}`, async () => {
        fs.rmSync(stateHelper.tmpDir, {recursive: true});
      });
    }
  }
);
