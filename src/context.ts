import * as core from '@actions/core';
import * as handlebars from 'handlebars';
import {Context} from '@docker/actions-toolkit/lib/context';
import {GitHub} from '@docker/actions-toolkit/lib/github';
import {Inputs as BuildxInputs} from '@docker/actions-toolkit/lib/buildx/inputs';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit';
import {Util} from '@docker/actions-toolkit/lib/util';

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

export async function getInputs(): Promise<Inputs> {
  return {
    addHosts: Util.getInputList('add-hosts'),
    allow: Util.getInputList('allow'),
    attests: Util.getInputList('attests', {ignoreComma: true}),
    buildArgs: Util.getInputList('build-args', {ignoreComma: true}),
    buildContexts: Util.getInputList('build-contexts', {ignoreComma: true}),
    builder: core.getInput('builder'),
    cacheFrom: Util.getInputList('cache-from', {ignoreComma: true}),
    cacheTo: Util.getInputList('cache-to', {ignoreComma: true}),
    cgroupParent: core.getInput('cgroup-parent'),
    context: core.getInput('context') || Context.gitContext(),
    file: core.getInput('file'),
    labels: Util.getInputList('labels', {ignoreComma: true}),
    load: core.getBooleanInput('load'),
    network: core.getInput('network'),
    noCache: core.getBooleanInput('no-cache'),
    noCacheFilters: Util.getInputList('no-cache-filters'),
    outputs: Util.getInputList('outputs', {ignoreComma: true}),
    platforms: Util.getInputList('platforms'),
    provenance: BuildxInputs.getProvenanceInput('provenance'),
    pull: core.getBooleanInput('pull'),
    push: core.getBooleanInput('push'),
    sbom: core.getInput('sbom'),
    secrets: Util.getInputList('secrets', {ignoreComma: true}),
    secretFiles: Util.getInputList('secret-files', {ignoreComma: true}),
    shmSize: core.getInput('shm-size'),
    ssh: Util.getInputList('ssh'),
    tags: Util.getInputList('tags'),
    target: core.getInput('target'),
    ulimit: Util.getInputList('ulimit', {ignoreComma: true}),
    githubToken: core.getInput('github-token')
  };
}

export async function getArgs(inputs: Inputs, toolkit: Toolkit): Promise<Array<string>> {
  const context = handlebars.compile(inputs.context)({
    defaultContext: Context.gitContext()
  });
  // prettier-ignore
  return [
    ...await getBuildArgs(inputs, context, toolkit),
    ...await getCommonArgs(inputs, toolkit),
    context
  ];
}

async function getBuildArgs(inputs: Inputs, context: string, toolkit: Toolkit): Promise<Array<string>> {
  const args: Array<string> = ['build'];
  await Util.asyncForEach(inputs.addHosts, async addHost => {
    args.push('--add-host', addHost);
  });
  if (inputs.allow.length > 0) {
    args.push('--allow', inputs.allow.join(','));
  }
  if (await toolkit.buildx.versionSatisfies('>=0.10.0')) {
    await Util.asyncForEach(inputs.attests, async attest => {
      args.push('--attest', attest);
    });
  }
  await Util.asyncForEach(inputs.buildArgs, async buildArg => {
    args.push('--build-arg', buildArg);
  });
  if (await toolkit.buildx.versionSatisfies('>=0.8.0')) {
    await Util.asyncForEach(inputs.buildContexts, async buildContext => {
      args.push('--build-context', buildContext);
    });
  }
  await Util.asyncForEach(inputs.cacheFrom, async cacheFrom => {
    args.push('--cache-from', cacheFrom);
  });
  await Util.asyncForEach(inputs.cacheTo, async cacheTo => {
    args.push('--cache-to', cacheTo);
  });
  if (inputs.cgroupParent) {
    args.push('--cgroup-parent', inputs.cgroupParent);
  }
  if (inputs.file) {
    args.push('--file', inputs.file);
  }
  if (!BuildxInputs.hasLocalExporter(inputs.outputs) && !BuildxInputs.hasTarExporter(inputs.outputs) && (inputs.platforms.length == 0 || (await toolkit.buildx.versionSatisfies('>=0.4.2')))) {
    args.push('--iidfile', BuildxInputs.getBuildImageIDFilePath());
  }
  await Util.asyncForEach(inputs.labels, async label => {
    args.push('--label', label);
  });
  await Util.asyncForEach(inputs.noCacheFilters, async noCacheFilter => {
    args.push('--no-cache-filter', noCacheFilter);
  });
  await Util.asyncForEach(inputs.outputs, async output => {
    args.push('--output', output);
  });
  if (inputs.platforms.length > 0) {
    args.push('--platform', inputs.platforms.join(','));
  }
  if (await toolkit.buildx.versionSatisfies('>=0.10.0')) {
    if (inputs.provenance) {
      args.push('--provenance', inputs.provenance);
    } else if ((await toolkit.buildkit.versionSatisfies(inputs.builder, '>=0.11.0')) && !BuildxInputs.hasDockerExporter(inputs.outputs, inputs.load)) {
      // if provenance not specified and BuildKit version compatible for
      // attestation, set default provenance. Also needs to make sure user
      // doesn't want to explicitly load the image to docker.
      if (GitHub.context.payload.repository?.private ?? false) {
        // if this is a private repository, we set the default provenance
        // attributes being set in buildx: https://github.com/docker/buildx/blob/fb27e3f919dcbf614d7126b10c2bc2d0b1927eb6/build/build.go#L603
        args.push('--provenance', BuildxInputs.resolveProvenanceAttrs(`mode=min,inline-only=true`));
      } else {
        // for a public repository, we set max provenance mode.
        args.push('--provenance', BuildxInputs.resolveProvenanceAttrs(`mode=max`));
      }
    }
    if (inputs.sbom) {
      args.push('--sbom', inputs.sbom);
    }
  }
  await Util.asyncForEach(inputs.secrets, async secret => {
    try {
      args.push('--secret', BuildxInputs.resolveBuildSecretString(secret));
    } catch (err) {
      core.warning(err.message);
    }
  });
  await Util.asyncForEach(inputs.secretFiles, async secretFile => {
    try {
      args.push('--secret', BuildxInputs.resolveBuildSecretFile(secretFile));
    } catch (err) {
      core.warning(err.message);
    }
  });
  if (inputs.githubToken && !BuildxInputs.hasGitAuthTokenSecret(inputs.secrets) && context.startsWith(Context.gitContext())) {
    args.push('--secret', BuildxInputs.resolveBuildSecretString(`GIT_AUTH_TOKEN=${inputs.githubToken}`));
  }
  if (inputs.shmSize) {
    args.push('--shm-size', inputs.shmSize);
  }
  await Util.asyncForEach(inputs.ssh, async ssh => {
    args.push('--ssh', ssh);
  });
  await Util.asyncForEach(inputs.tags, async tag => {
    args.push('--tag', tag);
  });
  if (inputs.target) {
    args.push('--target', inputs.target);
  }
  await Util.asyncForEach(inputs.ulimit, async ulimit => {
    args.push('--ulimit', ulimit);
  });
  return args;
}

async function getCommonArgs(inputs: Inputs, toolkit: Toolkit): Promise<Array<string>> {
  const args: Array<string> = [];
  if (inputs.builder) {
    args.push('--builder', inputs.builder);
  }
  if (inputs.load) {
    args.push('--load');
  }
  if (await toolkit.buildx.versionSatisfies('>=0.6.0')) {
    args.push('--metadata-file', BuildxInputs.getBuildMetadataFilePath());
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
