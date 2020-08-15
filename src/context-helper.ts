import * as core from '@actions/core';

export interface Inputs {
  context: string;
  file: string;
  buildArgs: string[];
  labels: string[];
  tags: string[];
  pull: boolean;
  target: string;
  noCache: boolean;
  builder: string;
  platforms: string;
  load: boolean;
  push: boolean;
  outputs: string[];
  cacheFrom: string[];
  cacheTo: string[];
}

export async function loadInputs(): Promise<Inputs> {
  return {
    context: core.getInput('context') || '.',
    file: core.getInput('file') || './Dockerfile',
    buildArgs: await getInputList('build-args'),
    labels: await getInputList('labels'),
    tags: await getInputList('tags'),
    pull: /true/i.test(core.getInput('pull')),
    target: core.getInput('target'),
    noCache: /true/i.test(core.getInput('no-cache')),
    builder: core.getInput('builder'),
    platforms: core.getInput('platforms'),
    load: /true/i.test(core.getInput('load')),
    push: /true/i.test(core.getInput('push')),
    outputs: await getInputList('outputs'),
    cacheFrom: await getInputList('cache-from'),
    cacheTo: await getInputList('cache-to')
  };
}

export async function mustBuildx(inputs: Inputs): Promise<boolean> {
  return (
    inputs.builder.length > 0 ||
    inputs.platforms.length > 0 ||
    inputs.load ||
    inputs.outputs.length > 0 ||
    inputs.cacheFrom.length > 0 ||
    inputs.cacheTo.length > 0
  );
}

async function getInputList(name: string): Promise<string[]> {
  const items = core.getInput(name);
  if (items == '') {
    return [];
  }
  return items.split(/\r?\n/).reduce<string[]>((acc, line) => acc.concat(line.split(',')).map(pat => pat.trim()), []);
}
