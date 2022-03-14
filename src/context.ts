import csvparse from 'csv-parse/lib/sync';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tmp from 'tmp';

import * as core from '@actions/core';
import {issueCommand} from '@actions/core/lib/command';
import * as github from '@actions/github';

import * as buildx from './buildx';
import * as handlebars from 'handlebars';

let _defaultContext, _tmpDir: string;

export interface Inputs {
  addHosts: string[];
  allow: string[];
  buildArgs: string[];
  buildContexts: string[];
  builder: string;
  cacheFrom: string[];
  cacheTo: string[];
  cgroupParent: string;
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
  shmSize: string;
  ssh: string[];
  tags: string[];
  target: string;
  ulimit: string[];
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
    addHosts: await getInputList('add-hosts'),
    allow: await getInputList('allow'),
    buildArgs: await getInputList('build-args', true),
    buildContexts: await getInputList('build-contexts', true),
    builder: core.getInput('builder'),
    cacheFrom: await getInputList('cache-from', true),
    cacheTo: await getInputList('cache-to', true),
    cgroupParent: core.getInput('cgroup-parent'),
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
    shmSize: core.getInput('shm-size'),
    ssh: await getInputList('ssh'),
    tags: await getInputList('tags'),
    target: core.getInput('target'),
    ulimit: await getInputList('ulimit', true),
    githubToken: core.getInput('github-token')
  };
}

export async function getArgs(inputs: Inputs, defaultContext: string, buildxVersion: string): Promise<Array<string>> {
  let args: Array<string> = ['buildx'];
  args.push.apply(args, await getBuildArgs(inputs, defaultContext, buildxVersion));
  args.push.apply(args, await getCommonArgs(inputs, buildxVersion));
  args.push(handlebars.compile(inputs.context)({defaultContext}));
  return args;
}

async function getBuildArgs(inputs: Inputs, defaultContext: string, buildxVersion: string): Promise<Array<string>> {
  let args: Array<string> = ['build'];
  await asyncForEach(inputs.addHosts, async addHost => {
    args.push('--add-host', addHost);
  });
  if (inputs.allow.length > 0) {
    args.push('--allow', inputs.allow.join(','));
  }
  await asyncForEach(inputs.buildArgs, async buildArg => {
    args.push('--build-arg', buildArg);
  });
  if (buildx.satisfies(buildxVersion, '>=0.8.0')) {
    await asyncForEach(inputs.buildContexts, async buildContext => {
      args.push('--build-context', buildContext);
    });
  }
  await asyncForEach(inputs.cacheFrom, async cacheFrom => {
    args.push('--cache-from', cacheFrom);
  });
  await asyncForEach(inputs.cacheTo, async cacheTo => {
    args.push('--cache-to', cacheTo);
  });
  if (inputs.cgroupParent) {
    args.push('--cgroup-parent', inputs.cgroupParent);
  }
  if (inputs.file) {
    args.push('--file', inputs.file);
  }
  if (!buildx.isLocalOrTarExporter(inputs.outputs) && (inputs.platforms.length == 0 || buildx.satisfies(buildxVersion, '>=0.4.2'))) {
    args.push('--iidfile', await buildx.getImageIDFile());
  }
  await asyncForEach(inputs.labels, async label => {
    args.push('--label', label);
  });
  await asyncForEach(inputs.outputs, async output => {
    args.push('--output', output);
  });
  if (inputs.platforms.length > 0) {
    args.push('--platform', inputs.platforms.join(','));
  }
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
  if (inputs.shmSize) {
    args.push('--shm-size', inputs.shmSize);
  }
  await asyncForEach(inputs.ssh, async ssh => {
    args.push('--ssh', ssh);
  });
  await asyncForEach(inputs.tags, async tag => {
    args.push('--tag', tag);
  });
  if (inputs.target) {
    args.push('--target', inputs.target);
  }
  await asyncForEach(inputs.ulimit, async ulimit => {
    args.push('--ulimit', ulimit);
  });
  return args;
}

async function getCommonArgs(inputs: Inputs, buildxVersion: string): Promise<Array<string>> {
  let args: Array<string> = [];
  if (inputs.builder) {
    args.push('--builder', inputs.builder);
  }
  if (inputs.load) {
    args.push('--load');
  }
  if (buildx.satisfies(buildxVersion, '>=0.6.0')) {
    args.push('--metadata-file', await buildx.getMetadataFile());
  }
  if (inputs.network) {
    args.push('--network', inputs.network);
  }
  if (inputs.noCache) {
    args.push('--no-cache');
  }
  if (inputs.pull) {
    args.push('--pull');
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

// FIXME: Temp fix https://github.com/actions/toolkit/issues/777
export function setOutput(name: string, value: any): void {
  issueCommand('set-output', {name}, value);
}
