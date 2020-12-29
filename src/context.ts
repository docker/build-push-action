import csvparse from 'csv-parse/lib/sync';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import * as tmp from 'tmp';

import * as core from '@actions/core';
import * as github from '@actions/github';

import * as buildx from './buildx';

let _defaultContext, _tmpDir: string;

export interface Inputs {
  context: string;
  file: string;
  buildArgs: string[];
  labels: string[];
  tags: string[];
  pull: boolean;
  target: string;
  allow: string[];
  noCache: boolean;
  builder: string;
  platforms: string[];
  load: boolean;
  push: boolean;
  outputs: string[];
  cacheFrom: string[];
  cacheTo: string[];
  secrets: string[];
  githubToken: string;
  ssh: string[];
}

export function defaultContext(): string {
  if (!_defaultContext) {
    _defaultContext = `https://github.com/${github.context.repo.owner}/${
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
    context: core.getInput('context') || defaultContext,
    file: core.getInput('file'),
    buildArgs: await getInputList('build-args', true),
    labels: await getInputList('labels', true),
    tags: await getInputList('tags'),
    pull: /true/i.test(core.getInput('pull')),
    target: core.getInput('target'),
    allow: await getInputList('allow'),
    noCache: /true/i.test(core.getInput('no-cache')),
    builder: core.getInput('builder'),
    platforms: await getInputList('platforms'),
    load: /true/i.test(core.getInput('load')),
    push: /true/i.test(core.getInput('push')),
    outputs: await getInputList('outputs', true),
    cacheFrom: await getInputList('cache-from', true),
    cacheTo: await getInputList('cache-to', true),
    secrets: await getInputList('secrets', true),
    githubToken: core.getInput('github-token'),
    ssh: await getInputList('ssh')
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
      args.push('--secret', await buildx.getSecret(secret));
    } catch (err) {
      core.warning(err.message);
    }
  });
  if (inputs.githubToken && !buildx.hasGitAuthToken(inputs.secrets) && inputs.context == defaultContext) {
    args.push('--secret', await buildx.getSecret(`GIT_AUTH_TOKEN=${inputs.githubToken}`));
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
