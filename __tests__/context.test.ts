import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {Builder} from '@docker/actions-toolkit/lib/buildx/builder';
import {Buildx} from '@docker/actions-toolkit/lib/buildx/buildx';
import {Context} from '@docker/actions-toolkit/lib/context';
import {Docker} from '@docker/actions-toolkit/lib/docker/docker';
import {GitHub} from '@docker/actions-toolkit/lib/github';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit';
import {BuilderInfo} from '@docker/actions-toolkit/lib/types/builder';
import {GitHubRepo} from '@docker/actions-toolkit/lib/types/github';

import * as context from '../src/context';

const tmpDir = path.join('/tmp', '.docker-build-push-jest');
const tmpName = path.join(tmpDir, '.tmpname-jest');

import repoFixture from './fixtures/github-repo.json';
jest.spyOn(GitHub.prototype, 'repoData').mockImplementation((): Promise<GitHubRepo> => {
  return <Promise<GitHubRepo>>(repoFixture as unknown);
});

jest.spyOn(Context, 'tmpDir').mockImplementation((): string => {
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, {recursive: true});
  }
  return tmpDir;
});

jest.spyOn(Context, 'tmpName').mockImplementation((): string => {
  return tmpName;
});

jest.spyOn(Docker, 'isAvailable').mockImplementation(async (): Promise<boolean> => {
  return true;
});

jest.spyOn(Builder.prototype, 'inspect').mockImplementation(async (): Promise<BuilderInfo> => {
  return {
    name: 'builder2',
    driver: 'docker-container',
    lastActivity: new Date('2023-01-16 09:45:23 +0000 UTC'),
    nodes: [
      {
        buildkit: 'v0.11.0',
        'buildkitd-flags': '--debug --allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
        'driver-opts': ['BUILDKIT_STEP_LOG_MAX_SIZE=10485760', 'BUILDKIT_STEP_LOG_MAX_SPEED=10485760', 'JAEGER_TRACE=localhost:6831', 'image=moby/buildkit:latest', 'network=host'],
        endpoint: 'unix:///var/run/docker.sock',
        name: 'builder20',
        platforms: 'linux/amd64,linux/amd64/v2,linux/amd64/v3,linux/arm64,linux/riscv64,linux/ppc64le,linux/s390x,linux/386,linux/mips64le,linux/mips64,linux/arm/v7,linux/arm/v6',
        status: 'running'
      }
    ]
  };
});

describe('getArgs', () => {
  beforeEach(() => {
    process.env = Object.keys(process.env).reduce((object, key) => {
      if (!key.startsWith('INPUT_')) {
        object[key] = process.env[key];
      }
      return object;
    }, {});
  });

  // prettier-ignore
  test.each([
    [
      0,
      '0.4.1',
      new Map<string, string>([
        ['context', '.'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '.'
      ]
    ],
    [
      1,
      '0.4.2',
      new Map<string, string>([
        ['build-args', `MY_ARG=val1,val2,val3
ARG=val
"MULTILINE=aaaa
bbbb
ccc"`],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--build-arg', 'MY_ARG=val1,val2,val3',
        '--build-arg', 'ARG=val',
        '--build-arg', `MULTILINE=aaaa\nbbbb\nccc`,
        '--iidfile', path.join(tmpDir, 'iidfile'),
        'https://github.com/docker/build-push-action.git#refs/heads/master'
      ]
    ],
    [
      2,
      '0.4.2',
      new Map<string, string>([
        ['tags', 'name/app:7.4, name/app:latest'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--tag', 'name/app:7.4',
        '--tag', 'name/app:latest',
        'https://github.com/docker/build-push-action.git#refs/heads/master'
      ]
    ],
    [
      3,
      '0.4.2',
      new Map<string, string>([
        ['context', '.'],
        ['labels', 'org.opencontainers.image.title=buildkit\norg.opencontainers.image.description=concurrent, cache-efficient, and Dockerfile-agnostic builder toolkit'],
        ['outputs', 'type=local,dest=./release-out'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--label', 'org.opencontainers.image.title=buildkit',
        '--label', 'org.opencontainers.image.description=concurrent, cache-efficient, and Dockerfile-agnostic builder toolkit',
        '--output', 'type=local,dest=./release-out',
        '.'
      ]
    ],
    [
      4,
      '0.4.1',
      new Map<string, string>([
        ['context', '.'],
        ['platforms', 'linux/amd64,linux/arm64'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--platform', 'linux/amd64,linux/arm64',
        '.'
      ]
    ],
    [
      5,
      '0.4.1',
      new Map<string, string>([
        ['context', '.'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '.'
      ]
    ],
    [
      6,
      '0.4.2',
      new Map<string, string>([
        ['context', '.'],
        ['secrets', 'GIT_AUTH_TOKEN=abcdefghijklmno=0123456789'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--secret', `id=GIT_AUTH_TOKEN,src=${tmpName}`,
        '.'
      ]
    ],
    [
      7,
      '0.4.2',
      new Map<string, string>([
        ['github-token', 'abcdefghijklmno0123456789'],
        ['outputs', '.'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--output', '.',
        '--secret', `id=GIT_AUTH_TOKEN,src=${tmpName}`,
        'https://github.com/docker/build-push-action.git#refs/heads/master'
      ]
    ],
    [
      8,
      '0.4.2',
      new Map<string, string>([
        ['context', 'https://github.com/docker/build-push-action.git#refs/heads/master'],
        ['tag', 'localhost:5000/name/app:latest'],
        ['platforms', 'linux/amd64,linux/arm64'],
        ['secrets', 'GIT_AUTH_TOKEN=abcdefghijklmno=0123456789'],
        ['file', './test/Dockerfile'],
        ['builder', 'builder-git-context-2'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'true'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--file', './test/Dockerfile',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--platform', 'linux/amd64,linux/arm64',
        '--secret', `id=GIT_AUTH_TOKEN,src=${tmpName}`,
        '--builder', 'builder-git-context-2',
        '--push',
        'https://github.com/docker/build-push-action.git#refs/heads/master'
      ]
    ],
    [
      9,
      '0.4.2',
      new Map<string, string>([
        ['context', 'https://github.com/docker/build-push-action.git#refs/heads/master'],
        ['tag', 'localhost:5000/name/app:latest'],
        ['platforms', 'linux/amd64,linux/arm64'],
        ['secrets', `GIT_AUTH_TOKEN=abcdefghi,jklmno=0123456789
"MYSECRET=aaaaaaaa
bbbbbbb
ccccccccc"
FOO=bar
"EMPTYLINE=aaaa

bbbb
ccc"`],
        ['file', './test/Dockerfile'],
        ['builder', 'builder-git-context-2'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'true'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--file', './test/Dockerfile',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--platform', 'linux/amd64,linux/arm64',
        '--secret', `id=GIT_AUTH_TOKEN,src=${tmpName}`,
        '--secret', `id=MYSECRET,src=${tmpName}`,
        '--secret', `id=FOO,src=${tmpName}`,
        '--secret', `id=EMPTYLINE,src=${tmpName}`,
        '--builder', 'builder-git-context-2',
        '--push',
        'https://github.com/docker/build-push-action.git#refs/heads/master'
      ]
    ],
    [
      10,
      '0.4.2',
      new Map<string, string>([
        ['context', 'https://github.com/docker/build-push-action.git#refs/heads/master'],
        ['tag', 'localhost:5000/name/app:latest'],
        ['platforms', 'linux/amd64,linux/arm64'],
        ['secrets', `GIT_AUTH_TOKEN=abcdefghi,jklmno=0123456789
MYSECRET=aaaaaaaa
bbbbbbb
ccccccccc
FOO=bar
EMPTYLINE=aaaa

bbbb
ccc`],
        ['file', './test/Dockerfile'],
        ['builder', 'builder-git-context-2'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'true'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--file', './test/Dockerfile',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--platform', 'linux/amd64,linux/arm64',
        '--secret', `id=GIT_AUTH_TOKEN,src=${tmpName}`,
        '--secret', `id=MYSECRET,src=${tmpName}`,
        '--secret', `id=FOO,src=${tmpName}`,
        '--secret', `id=EMPTYLINE,src=${tmpName}`,
        '--builder', 'builder-git-context-2',
        '--push',
        'https://github.com/docker/build-push-action.git#refs/heads/master'
      ]
    ],
    [
      11,
      '0.5.1',
      new Map<string, string>([
        ['context', 'https://github.com/docker/build-push-action.git#refs/heads/master'],
        ['tag', 'localhost:5000/name/app:latest'],
        ['secret-files', `MY_SECRET=${path.join(__dirname, 'fixtures', 'secret.txt')}`],
        ['file', './test/Dockerfile'],
        ['builder', 'builder-git-context-2'],
        ['network', 'host'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'true'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--file', './test/Dockerfile',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--secret', `id=MY_SECRET,src=${tmpName}`,
        '--builder', 'builder-git-context-2',
        '--network', 'host',
        '--push',
        'https://github.com/docker/build-push-action.git#refs/heads/master'
      ]
    ],
    [
      12,
      '0.4.2',
      new Map<string, string>([
        ['context', '.'],
        ['labels', 'org.opencontainers.image.title=filter_results_top_n\norg.opencontainers.image.description=Reference implementation of operation "filter results (top-n)"'],
        ['outputs', 'type=local,dest=./release-out'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--label', 'org.opencontainers.image.title=filter_results_top_n',
        '--label', 'org.opencontainers.image.description=Reference implementation of operation "filter results (top-n)"',
        '--output', 'type=local,dest=./release-out',
        '.'
      ]
    ],
    [
      13,
      '0.6.0',
      new Map<string, string>([
        ['context', '.'],
        ['tag', 'localhost:5000/name/app:latest'],
        ['file', './test/Dockerfile'],
        ['add-hosts', 'docker:10.180.0.1,foo:10.0.0.1'],
        ['network', 'host'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'true'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--add-host', 'docker:10.180.0.1',
        '--add-host', 'foo:10.0.0.1',
        '--file', './test/Dockerfile',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '--network', 'host',
        '--push',
        '.'
      ]
    ],
    [
      14,
      '0.7.0',
      new Map<string, string>([
        ['context', '.'],
        ['file', './test/Dockerfile'],
        ['add-hosts', 'docker:10.180.0.1\nfoo:10.0.0.1'],
        ['cgroup-parent', 'foo'],
        ['shm-size', '2g'],
        ['ulimit', `nofile=1024:1024
nproc=3`],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--add-host', 'docker:10.180.0.1',
        '--add-host', 'foo:10.0.0.1',
        '--cgroup-parent', 'foo',
        '--file', './test/Dockerfile',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--shm-size', '2g',
        '--ulimit', 'nofile=1024:1024',
        '--ulimit', 'nproc=3',
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '.'
      ]
    ],
    [
      15,
      '0.7.0',
      new Map<string, string>([
        ['context', '{{defaultContext}}:docker'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        'https://github.com/docker/build-push-action.git#refs/heads/master:docker'
      ]
    ],
    [
      16,
      '0.8.2',
      new Map<string, string>([
        ['github-token', 'abcdefghijklmno0123456789'],
        ['context', '{{defaultContext}}:subdir'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--secret', `id=GIT_AUTH_TOKEN,src=${tmpName}`,
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        'https://github.com/docker/build-push-action.git#refs/heads/master:subdir'
      ]
    ],
    [
      17,
      '0.8.2',
      new Map<string, string>([
        ['context', '.'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
        ['provenance', 'true'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '.'
      ]
    ],
    [
      18,
      '0.10.0',
      new Map<string, string>([
        ['context', '.'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        "--provenance", `mode=min,inline-only=true,builder-id=https://github.com/docker/build-push-action/actions/runs/123456789`,
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '.'
      ]
    ],
    [
      19,
      '0.10.0',
      new Map<string, string>([
        ['context', '.'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
        ['provenance', 'true'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        "--provenance", `builder-id=https://github.com/docker/build-push-action/actions/runs/123456789`,
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '.'
      ]
    ],
    [
      20,
      '0.10.0',
      new Map<string, string>([
        ['context', '.'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
        ['provenance', 'mode=max'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        "--provenance", `mode=max,builder-id=https://github.com/docker/build-push-action/actions/runs/123456789`,
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '.'
      ]
    ],
    [
      21,
      '0.10.0',
      new Map<string, string>([
        ['context', '.'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
        ['provenance', 'false'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        "--provenance", 'false',
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '.'
      ]
    ],
    [
      22,
      '0.10.0',
      new Map<string, string>([
        ['context', '.'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
        ['provenance', 'builder-id=foo'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        "--provenance", 'builder-id=foo',
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '.'
      ]
    ],
    [
      23,
      '0.10.0',
      new Map<string, string>([
        ['context', '.'],
        ['load', 'false'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
        ['outputs', 'type=docker'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        "--output", 'type=docker',
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '.'
      ]
    ],
    [
      24,
      '0.10.0',
      new Map<string, string>([
        ['context', '.'],
        ['load', 'true'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--load',
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '.'
      ]
    ],
    [
      25,
      '0.10.0',
      new Map<string, string>([
        ['context', '.'],
        ['build-args', `FOO=bar#baz`],
        ['load', 'true'],
        ['no-cache', 'false'],
        ['push', 'false'],
        ['pull', 'false'],
      ]),
      [
        'build',
        '--build-arg', 'FOO=bar#baz',
        '--iidfile', path.join(tmpDir, 'iidfile'),
        '--load',
        '--metadata-file', path.join(tmpDir, 'metadata-file'),
        '.'
      ]
    ],
  ])(
    '[%d] given %p with %p as inputs, returns %p',
    async (num: number, buildxVersion: string, inputs: Map<string, string>, expected: Array<string>) => {
      inputs.forEach((value: string, name: string) => {
        setInput(name, value);
      });
      const toolkit = new Toolkit();
      jest.spyOn(Buildx.prototype, 'version').mockImplementation(async (): Promise<string> => {
        return buildxVersion;
      });
      const inp = await context.getInputs();
      const res = await context.getArgs(inp, toolkit);
      expect(res).toEqual(expected);
    }
  );
});

// See: https://github.com/actions/toolkit/blob/a1b068ec31a042ff1e10a522d8fdf0b8869d53ca/packages/core/src/core.ts#L89
function getInputName(name: string): string {
  return `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
}

function setInput(name: string, value: string): void {
  process.env[getInputName(name)] = value;
}
