import * as core from '@actions/core';

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
  cacheGithub: boolean;
}

export async function getInputs(): Promise<Inputs> {
  return {
    context: core.getInput('context') || '.',
    file: core.getInput('file') || './Dockerfile',
    buildArgs: await getInputList('build-args'),
    labels: await getInputList('labels'),
    tags: await getInputList('tags'),
    pull: /true/i.test(core.getInput('pull')),
    target: core.getInput('target'),
    allow: await getInputList('allow'),
    noCache: /true/i.test(core.getInput('no-cache')),
    builder: core.getInput('builder'),
    platforms: await getInputList('platforms'),
    load: /true/i.test(core.getInput('load')),
    push: /true/i.test(core.getInput('push')),
    outputs: await getInputList('outputs'),
    cacheFrom: await getInputList('cache-from'),
    cacheTo: await getInputList('cache-to'),
    cacheGithub: /true/i.test(core.getInput('cache-github'))
  };
}

export async function getArgs(inputs: Inputs): Promise<Array<string>> {
  let args: Array<string> = ['buildx'];
  args.push.apply(args, await getBuildArgs(inputs));
  args.push.apply(args, await getCommonArgs(inputs));
  args.push(inputs.context);
  return args;
}

async function getCommonArgs(inputs: Inputs): Promise<Array<string>> {
  let args: Array<string> = [];
  if (inputs.noCache) {
    args.push('--no-cache');
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

async function getBuildArgs(inputs: Inputs): Promise<Array<string>> {
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
  if (inputs.allow) {
    args.push('--allow', inputs.allow.join(','));
  }
  if (inputs.platforms) {
    args.push('--platform', inputs.platforms.join(','));
  }
  await asyncForEach(inputs.outputs, async output => {
    args.push('--output', output);
  });
  await asyncForEach(inputs.cacheFrom, async cacheFrom => {
    args.push('--cache-from', cacheFrom);
  });
  await asyncForEach(inputs.cacheTo, async cacheTo => {
    args.push('--cache-to', cacheTo);
  });
  if (inputs.file) {
    args.push('--file', inputs.file);
  }
  return args;
}

export async function getInputList(name: string): Promise<string[]> {
  const items = core.getInput(name);
  if (items == '') {
    return [];
  }
  return items.split(/\r?\n/).reduce<string[]>((acc, line) => acc.concat(line.split(',')).map(pat => pat.trim()), []);
}

export const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};
