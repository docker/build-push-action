import csvparse from 'csv-parse/lib/sync';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
    let ref = github.context.ref;
    if (github.context.sha && ref && !ref.startsWith('refs/')) {
      ref = `refs/heads/${github.context.ref}`;
    }
    if (github.context.sha && !ref.startsWith(`refs/pull/`)) {
      ref = github.context.sha;
    }
    _defaultContext = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${github.context.repo.owner}/${github.context.repo.repo}.git#${ref}`;
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
    load: core.getBooleanInput('load'),
    network: core.getInput('network'),
    noCache: core.getBooleanInput('no-cache'),
    outputs: await getInputList('outputs', true),
    platforms: await getInputList('platforms'),
    pull: core.getBooleanInput('pull'),
    push: core.getBooleanInput('push'),
    secrets: await getInputList('secrets', true),
    secretFiles: await getInputList('secret-files', true),
    ssh: await getInputList('ssh'),
    tags: await getInputList('tags'),
    target: core.getInput('target'),
    githubToken: core.getInput('github-token')
  };
}

export async function getArgs(inputs: Inputs, defaultContext: string, buildxVersion: string): Promise<Array<string>> {
  return [
    'buildx',
    ...await getBuildArgs(inputs, defaultContext, buildxVersion),
    ...await getCommonArgs(inputs),
    inputs.context,
  ];
}

async function getBuildArgs(inputs: Inputs, defaultContext: string, buildxVersion: string): Promise<Array<string>> {
  const args: Array<string> = ['build'].concat(
    ...flagMap(inputs.buildArgs, '--build-arg'),
    ...flagMap(inputs.cacheFrom, '--cache-from'),
    ...flagMap(inputs.cacheTo, '--cache-to'),
    ...flagMap(inputs.labels, '--label'),
    ...flagMap(inputs.outputs, '--output'),
    ...flagMap(inputs.tags, '--tag'),
    ...flagMap(inputs.ssh, '--ssh'),
  );

  if (inputs.target) {
    args.push('--target', inputs.target);
  }
  if (inputs.allow.length > 0) {
    args.push('--allow', inputs.allow.join(','));
  }
  if (inputs.platforms.length > 0) {
    args.push('--platform', inputs.platforms.join(','));
  }
  if (!buildx.isLocalOrTarExporter(inputs.outputs) && (inputs.platforms.length == 0 || buildx.satisfies(buildxVersion, '>=0.4.2'))) {
    args.push('--iidfile', await buildx.getImageIDFile());
  }
  if (buildx.satisfies(buildxVersion, '>=0.6.0')) {
    args.push('--metadata-file', await buildx.getMetadataFile());
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
    relax: true,
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

export function flagMap(array: string[], flag: string): string[][] {
  return array.map(value => [flag, value]);
}

// FIXME: Temp fix https://github.com/actions/toolkit/issues/777
export function setOutput(name: string, value: any): void {
  issueCommand('set-output', {name}, value);
}
