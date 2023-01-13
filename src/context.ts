import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tmp from 'tmp';
import * as buildx from './buildx';
import * as core from '@actions/core';
import * as github from '@actions/github';
import {parse} from 'csv-parse/sync';
import * as handlebars from 'handlebars';

let _defaultContext, _tmpDir: string;

export interface Inputs {
  addHosts: string[];
  allow: string[];
  attests: string[];
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
  noCacheFilters: string[];
  outputs: string[];
  platforms: string[];
  provenance: string;
  pull: boolean;
  push: boolean;
  sbom: string;
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

export function provenanceBuilderID(): string {
  return `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
}

export async function getInputs(defaultContext: string): Promise<Inputs> {
  return {
    addHosts: await getInputList('add-hosts'),
    allow: await getInputList('allow'),
    attests: await getInputList('attests', true),
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
    noCacheFilters: await getInputList('no-cache-filters'),
    outputs: await getInputList('outputs', true),
    platforms: await getInputList('platforms'),
    provenance: getProvenanceInput('provenance'),
    pull: core.getBooleanInput('pull'),
    push: core.getBooleanInput('push'),
    sbom: core.getInput('sbom'),
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

export async function getArgs(inputs: Inputs, defaultContext: string, buildxVersion: string, standalone?: boolean): Promise<Array<string>> {
  const context = handlebars.compile(inputs.context)({defaultContext});
  // prettier-ignore
  return [
    ...await getBuildArgs(inputs, defaultContext, context, buildxVersion, standalone),
    ...await getCommonArgs(inputs, buildxVersion),
    context
  ];
}

async function getBuildArgs(inputs: Inputs, defaultContext: string, context: string, buildxVersion: string, standalone?: boolean): Promise<Array<string>> {
  const args: Array<string> = ['build'];
  await asyncForEach(inputs.addHosts, async addHost => {
    args.push('--add-host', addHost);
  });
  if (inputs.allow.length > 0) {
    args.push('--allow', inputs.allow.join(','));
  }
  if (buildx.satisfies(buildxVersion, '>=0.10.0')) {
    await asyncForEach(inputs.attests, async attest => {
      args.push('--attest', attest);
    });
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
  await asyncForEach(inputs.noCacheFilters, async noCacheFilter => {
    args.push('--no-cache-filter', noCacheFilter);
  });
  await asyncForEach(inputs.outputs, async output => {
    args.push('--output', output);
  });
  if (inputs.platforms.length > 0) {
    args.push('--platform', inputs.platforms.join(','));
  }
  if (buildx.satisfies(buildxVersion, '>=0.10.0')) {
    if (inputs.provenance) {
      args.push('--provenance', inputs.provenance);
    } else if ((await buildx.satisfiesBuildKitVersion(inputs.builder, '>=0.11.0', standalone)) && !hasDockerExport(inputs)) {
      // if provenance not specified and BuildKit version compatible for
      // attestation, set default provenance. Also needs to make sure user
      // doesn't want to explicitly load the image to docker.
      if (fromPayload('repository.private') !== false) {
        // if this is a private repository, we set the default provenance
        // attributes being set in buildx: https://github.com/docker/buildx/blob/fb27e3f919dcbf614d7126b10c2bc2d0b1927eb6/build/build.go#L603
        args.push('--provenance', getProvenanceAttrs(`mode=min,inline-only=true`));
      } else {
        // for a public repository, we set max provenance mode.
        args.push('--provenance', getProvenanceAttrs(`mode=max`));
      }
    }
    if (inputs.sbom) {
      args.push('--sbom', inputs.sbom);
    }
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
  if (inputs.githubToken && !buildx.hasGitAuthToken(inputs.secrets) && context.startsWith(defaultContext)) {
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
  const args: Array<string> = [];
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
  const res: Array<string> = [];

  const items = core.getInput(name);
  if (items == '') {
    return res;
  }

  const records = await parse(items, {
    columns: false,
    relaxQuotes: true,
    relaxColumnCount: true,
    skipEmptyLines: true
  });

  for (const record of records as Array<string[]>) {
    if (record.length == 1) {
      res.push(record[0]);
      continue;
    } else if (!ignoreComma) {
      res.push(...record);
      continue;
    }
    res.push(record.join(','));
  }

  return res.filter(item => item).map(pat => pat.trim());
}

export const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromPayload(path: string): any {
  return select(github.context.payload, path);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function select(obj: any, path: string): any {
  if (!obj) {
    return undefined;
  }
  const i = path.indexOf('.');
  if (i < 0) {
    return obj[path];
  }
  const key = path.slice(0, i);
  return select(obj[key], path.slice(i + 1));
}

function getProvenanceInput(name: string): string {
  const input = core.getInput(name);
  if (!input) {
    // if input is not set, default values will be set later.
    return input;
  }
  const builderID = provenanceBuilderID();
  try {
    return core.getBooleanInput(name) ? `builder-id=${builderID}` : 'false';
  } catch (err) {
    // not a valid boolean, so we assume it's a string
    return getProvenanceAttrs(input);
  }
}

function getProvenanceAttrs(input: string): string {
  const builderID = provenanceBuilderID();
  // parse attributes from input
  const fields = parse(input, {
    relaxColumnCount: true,
    skipEmptyLines: true
  })[0];
  // check if builder-id attribute exists in the input
  for (const field of fields) {
    const parts = field
      .toString()
      .split(/(?<=^[^=]+?)=/)
      .map(item => item.trim());
    if (parts[0] == 'builder-id') {
      return input;
    }
  }
  // if not add builder-id attribute
  return `${input},builder-id=${builderID}`;
}

function hasDockerExport(inputs: Inputs): boolean {
  if (inputs.load) {
    return true;
  }
  for (const output of inputs.outputs) {
    const fields = parse(output, {
      relaxColumnCount: true,
      skipEmptyLines: true
    })[0];
    for (const field of fields) {
      const parts = field
        .toString()
        .split(/(?<=^[^=]+?)=/)
        .map(item => item.trim());
      if (parts.length != 2) {
        continue;
      }
      if (parts[0] == 'type' && parts[1] == 'docker') {
        return true;
      }
    }
  }
  return false;
}
