import csvparse from 'csv-parse/lib/sync';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import * as tmp from 'tmp';

import * as core from '@actions/core';
import {issueCommand} from '@actions/core/lib/command';
import * as github from '@actions/github';

import * as buildx from './buildx';

let _defaultContext, _tmpDir: string;

export interface Inputs {
  allow: string[];
  buildArgs: string[];
  builder: string;
  cacheFrom: string[];
  cacheTo: string[];
  context: string;
  file: string;
  labels: string[];
  load: boolean;
  network: string;
  noCache: boolean;
  outputs: string[];
  platforms: string[];
  pull: boolean;
  push: boolean;
  secrets: string[];
  secretFiles: string[];
  ssh: string[];
  tags: string[];
  target: string;
  githubToken: string;
}

export function defaultContext(): string {
  if (!_defaultContext) {
    _defaultContext = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${github.context.repo.owner}/${
      github.context.repo.repo
    }.git#${github.context?.ref?.replace(/^refs\//, '')}`;
  }
  return _defaultContext;
}

export function tmpDir(): string {
  if (!_tmpDir) {
    _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-build-push-')).split(path.sep).join(path.posix.sep);
  }
  return _tmpDir;
}

export function tmpNameSync(options?: tmp.TmpNameOptions): string {
  return tmp.tmpNameSync(options);
}

export async function getInputs(defaultContext: string): Promise<Inputs> {
  return {
    allow: await getInputList('allow'),
    buildArgs: await getInputList('build-args', true),
    builder: core.getInput('builder'),
    cacheFrom: await getInputList('cache-from', true),
    cacheTo: await getInputList('cache-to', true),
    context: core.getInput('context') || defaultContext,
    file: core.getInput('file'),
    labels: await getInputList('labels', true),
    load: /true/i.test(core.getInput('load')),
    network: core.getInput('network'),
    noCache: /true/i.test(core.getInput('no-cache')),
    outputs: await getInputList('outputs', true),
    platforms: await getInputList('platforms'),
    pull: /true/i.test(core.getInput('pull')),
    push: /true/i.test(core.getInput('push')),
    secrets: await getInputList('secrets', true),
    secretFiles: await getInputList('secret-files', true),
    ssh: await getInputList('ssh'),
    tags: await getInputList('tags'),
    target: core.getInput('target'),
    githubToken: core.getInput('github-token')
  };
}

export async function getArgs(inputs: Inputs, defaultContext: string, buildxVersion: string): Promise<Array<string>> {
  let args: Array<string> = ['buildx'];
  args.push.apply(args, await getBuildArgs(inputs, defaultContext, buildxVersion));
  args.push.apply(args, await getCommonArgs(inputs));
  args.push(inputs.context);
  return args;
}

async function getBuildArgs(inputs: Inputs, defaultContext: string, buildxVersion: string): Promise<Array<string>> {
  let args: Array<string> = ['build'];
  await asyncForEach(inputs.buildArgs, async buildArg => {
    args.push('--build-arg', buildArg);
  });
  await asyncForEach(inputs.labels, async label => {
    args.push('--label', label);
  });
  await asyncForEach(inputs.tags, async tag => {
    args.push('--tag', tag);
  });
  if (inputs.target) {
    args.push('--target', inputs.target);
  }
  if (inputs.allow.length > 0) {
    args.push('--allow', inputs.allow.join(','));
  }
  if (inputs.platforms.length > 0) {
    args.push('--platform', inputs.platforms.join(','));
  }
  await asyncForEach(inputs.outputs, async output => {
    args.push('--output', output);
  });
  if (
    !buildx.isLocalOrTarExporter(inputs.outputs) &&
    (inputs.platforms.length == 0 || semver.satisfies(buildxVersion, '>=0.4.2'))
  ) {
    args.push('--iidfile', await buildx.getImageIDFile());
  }
  await asyncForEach(inputs.cacheFrom, async cacheFrom => {
    args.push('--cache-from', cacheFrom);
  });
  await asyncForEach(inputs.cacheTo, async cacheTo => {
    args.push('--cache-to', cacheTo);
  });
  await asyncForEach(inputs.secrets, async secret => {
    try {
      args.push('--secret', await buildx.getSecretString(secret));
    } catch (err) {
      core.warning(err.message);
    }
  });
  await asyncForEach(inputs.secretFiles, async secretFile => {
    try {
      args.push('--secret', await buildx.getSecretFile(secretFile));
    } catch (err) {
      core.warning(err.message);
    }
  });
  if (inputs.githubToken && !buildx.hasGitAuthToken(inputs.secrets) && inputs.context == defaultContext) {
    args.push('--secret', await buildx.getSecretString(`GIT_AUTH_TOKEN=${inputs.githubToken}`));
  }
  await asyncForEach(inputs.ssh, async ssh => {
    args.push('--ssh', ssh);
  });
  if (inputs.file) {
    args.push('--file', inputs.file);
  }
  return args;
}

async function getCommonArgs(inputs: Inputs): Promise<Array<string>> {
  let args: Array<string> = [];
  if (inputs.noCache) {
    args.push('--no-cache');
  }
  if (inputs.builder) {
    args.push('--builder', inputs.builder);
  }
  if (inputs.pull) {
    args.push('--pull');
  }
  if (inputs.load) {
    args.push('--load');
  }
  if (inputs.network) {
    args.push('--network', inputs.network);
  }
  if (inputs.push) {
    args.push('--push');
  }
  return args;
}

export async function getInputList(name: string, ignoreComma?: boolean): Promise<string[]> {
  let res: Array<string> = [];

  const items = core.getInput(name);
  if (items == '') {
    return res;
  }

  for (let output of (await csvparse(items, {
    columns: false,
    relaxColumnCount: true,
    skipLinesWithEmptyValues: true
  })) as Array<string[]>) {
    if (output.length == 1) {
      res.push(output[0]);
      continue;
    } else if (!ignoreComma) {
      res.push(...output);
      continue;
    }
    res.push(output.join(','));
  }

  return res.filter(item => item).map(pat => pat.trim());
}

export const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};

// FIXME: Temp fix https://github.com/actions/toolkit/issues/777
export function setOutput(name: string, value: any): void {
  issueCommand('set-output', {name}, value);
}
