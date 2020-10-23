import * as fs from 'fs';
import * as path from 'path';
import * as context from '../src/context';

jest.spyOn(context, 'defaultContext').mockImplementation((): string => {
  return 'https://github.com/docker/build-push-action.git#test-jest';
});

jest.spyOn(context, 'tmpDir').mockImplementation((): string => {
  const tmpDir = path.join('/tmp/.docker-build-push-jest').split(path.sep).join(path.posix.sep);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, {recursive: true});
  }
  return tmpDir;
});

jest.spyOn(context, 'tmpNameSync').mockImplementation((): string => {
  return path.join('/tmp/.docker-build-push-jest', '.tmpname-jest').split(path.sep).join(path.posix.sep);
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
      '0.4.1',
      new Map<string, string>([
        ['context', '.'],
      ]),
      [
        'buildx',
        'build',
        '--iidfile', '/tmp/.docker-build-push-jest/iidfile',
        '--file', 'Dockerfile',
        '.'
      ]
    ],
    [
      '0.4.2',
      new Map<string, string>([
        ['build-args', 'MY_ARG=val1,val2,val3\nARG=val'],
      ]),
      [
        'buildx',
        'build',
        '--build-arg', 'MY_ARG=val1,val2,val3',
        '--build-arg', 'ARG=val',
        '--iidfile', '/tmp/.docker-build-push-jest/iidfile',
        '--file', 'Dockerfile',
        'https://github.com/docker/build-push-action.git#test-jest'
      ]
    ],
    [
      '0.4.2',
      new Map<string, string>([
        ['context', '.'],
        ['labels', 'org.opencontainers.image.title=buildkit\norg.opencontainers.image.description=concurrent, cache-efficient, and Dockerfile-agnostic builder toolkit'],
        ['outputs', 'type=local,dest=./release-out']
      ]),
      [
        'buildx',
        'build',
        '--label', 'org.opencontainers.image.title=buildkit',
        '--label', 'org.opencontainers.image.description=concurrent, cache-efficient, and Dockerfile-agnostic builder toolkit',
        '--output', 'type=local,dest=./release-out',
        '--file', 'Dockerfile',
        '.'
      ]
    ],
    [
      '0.4.1',
      new Map<string, string>([
        ['context', '.'],
        ['platforms', 'linux/amd64,linux/arm64']
      ]),
      [
        'buildx',
        'build',
        '--platform', 'linux/amd64,linux/arm64',
        '--file', 'Dockerfile',
        '.'
      ]
    ],
    [
      '0.4.1',
      new Map<string, string>([
        ['context', '.']
      ]),
      [
        'buildx',
        'build',
        '--iidfile', '/tmp/.docker-build-push-jest/iidfile',
        '--file', 'Dockerfile',
        '.'
      ]
    ],
    [
      '0.4.2',
      new Map<string, string>([
        ['context', '.'],
        ['secrets', 'GIT_AUTH_TOKEN=abcdefghijklmno=0123456789'],
      ]),
      [
        'buildx',
        'build',
        '--iidfile', '/tmp/.docker-build-push-jest/iidfile',
        '--secret', 'id=GIT_AUTH_TOKEN,src=/tmp/.docker-build-push-jest/.tmpname-jest',
        '--file', 'Dockerfile',
        '.'
      ]
    ],
    [
      '0.4.2',
      new Map<string, string>([
        ['github-token', 'abcdefghijklmno0123456789'],
        ['outputs', '.']
      ]),
      [
        'buildx',
        'build',
        '--output', '.',
        '--secret', 'id=GIT_AUTH_TOKEN,src=/tmp/.docker-build-push-jest/.tmpname-jest',
        '--file', 'Dockerfile',
        'https://github.com/docker/build-push-action.git#test-jest'
      ]
    ],
    [
      '0.4.2',
      new Map<string, string>([
        ['context', 'https://github.com/docker/build-push-action.git#heads/master'],
        ['tag', 'localhost:5000/name/app:latest'],
        ['platforms', 'linux/amd64,linux/arm64'],
        ['secrets', 'GIT_AUTH_TOKEN=abcdefghijklmno=0123456789'],
        ['file', './test/Dockerfile'],
        ['builder', 'builder-git-context-2'],
        ['push', 'true']
      ]),
      [
        'buildx',
        'build',
        '--platform', 'linux/amd64,linux/arm64',
        '--iidfile', '/tmp/.docker-build-push-jest/iidfile',
        '--secret', 'id=GIT_AUTH_TOKEN,src=/tmp/.docker-build-push-jest/.tmpname-jest',
        '--file', './test/Dockerfile',
        '--builder', 'builder-git-context-2',
        '--push',
        'https://github.com/docker/build-push-action.git#heads/master'
      ]
    ]
  ])(
    'given %p with %p as inputs, returns %p',
    async (buildxVersion: string, inputs: Map<string, any>, expected: Array<string>) => {
      await inputs.forEach((value: string, name: string) => {
        setInput(name, value);
      });
      const defContext = context.defaultContext();
      const inp = await context.getInputs(defContext);
      console.log(inp);
      const res = await context.getArgs(inp, defContext, buildxVersion);
      console.log(res);
      expect(res).toEqual(expected);
    }
  );
});

describe('getInputList', () => {
  it('handles single line correctly', async () => {
    await setInput('foo', 'bar');
    const res = await context.getInputList('foo');
    console.log(res);
    expect(res).toEqual(['bar']);
  });

  it('handles multiple lines correctly', async () => {
    setInput('foo', 'bar\nbaz');
    const res = await context.getInputList('foo');
    console.log(res);
    expect(res).toEqual(['bar', 'baz']);
  });

  it('remove empty lines correctly', async () => {
    setInput('foo', 'bar\n\nbaz');
    const res = await context.getInputList('foo');
    console.log(res);
    expect(res).toEqual(['bar', 'baz']);
  });

  it('handles comma correctly', async () => {
    setInput('foo', 'bar,baz');
    const res = await context.getInputList('foo');
    console.log(res);
    expect(res).toEqual(['bar', 'baz']);
  });

  it('remove empty result correctly', async () => {
    setInput('foo', 'bar,baz,');
    const res = await context.getInputList('foo');
    console.log(res);
    expect(res).toEqual(['bar', 'baz']);
  });

  it('handles different new lines correctly', async () => {
    setInput('foo', 'bar\r\nbaz');
    const res = await context.getInputList('foo');
    console.log(res);
    expect(res).toEqual(['bar', 'baz']);
  });

  it('handles different new lines and comma correctly', async () => {
    setInput('foo', 'bar\r\nbaz,bat');
    const res = await context.getInputList('foo');
    console.log(res);
    expect(res).toEqual(['bar', 'baz', 'bat']);
  });

  it('handles multiple lines and ignoring comma correctly', async () => {
    setInput('cache-from', 'user/app:cache\ntype=local,src=path/to/dir');
    const res = await context.getInputList('cache-from', true);
    console.log(res);
    expect(res).toEqual(['user/app:cache', 'type=local,src=path/to/dir']);
  });

  it('handles different new lines and ignoring comma correctly', async () => {
    setInput('cache-from', 'user/app:cache\r\ntype=local,src=path/to/dir');
    const res = await context.getInputList('cache-from', true);
    console.log(res);
    expect(res).toEqual(['user/app:cache', 'type=local,src=path/to/dir']);
  });
});

describe('asyncForEach', () => {
  it('executes async tasks sequentially', async () => {
    const testValues = [1, 2, 3, 4, 5];
    const results: number[] = [];

    await context.asyncForEach(testValues, async value => {
      results.push(value);
    });

    expect(results).toEqual(testValues);
  });
});

// See: https://github.com/actions/toolkit/blob/master/packages/core/src/core.ts#L67
function getInputName(name: string): string {
  return `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
}

function setInput(name: string, value: string): void {
  process.env[getInputName(name)] = value;
}
