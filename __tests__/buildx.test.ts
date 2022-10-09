import {describe, expect, it, jest, test} from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import * as exec from '@actions/exec';
import * as buildx from '../src/buildx';
import * as context from '../src/context';

const tmpNameSync = path.join('/tmp/.docker-build-push-jest', '.tmpname-jest').split(path.sep).join(path.posix.sep);
const imageID = 'sha256:bfb45ab72e46908183546477a08f8867fc40cebadd00af54b071b097aed127a9';
const metadata = `{
  "containerimage.config.digest": "sha256:059b68a595b22564a1cbc167af369349fdc2ecc1f7bc092c2235cbf601a795fd",
  "containerimage.digest": "sha256:b09b9482c72371486bb2c1d2c2a2633ed1d0b8389e12c8d52b9e052725c0c83c"
}`;

jest.spyOn(context, 'tmpDir').mockImplementation((): string => {
  const tmpDir = path.join('/tmp/.docker-build-push-jest').split(path.sep).join(path.posix.sep);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, {recursive: true});
  }
  return tmpDir;
});

jest.spyOn(context, 'tmpNameSync').mockImplementation((): string => {
  return tmpNameSync;
});

describe('getImageID', () => {
  it('matches', async () => {
    const imageIDFile = await buildx.getImageIDFile();
    await fs.writeFileSync(imageIDFile, imageID);
    const expected = await buildx.getImageID();
    expect(expected).toEqual(imageID);
  });
});

describe('getMetadata', () => {
  it('matches', async () => {
    const metadataFile = await buildx.getMetadataFile();
    await fs.writeFileSync(metadataFile, metadata);
    const expected = await buildx.getMetadata();
    expect(expected).toEqual(metadata);
  });
});

describe('getDigest', () => {
  it('matches', async () => {
    const metadataFile = await buildx.getMetadataFile();
    await fs.writeFileSync(metadataFile, metadata);
    const expected = await buildx.getDigest(metadata);
    expect(expected).toEqual('sha256:b09b9482c72371486bb2c1d2c2a2633ed1d0b8389e12c8d52b9e052725c0c83c');
  });
});

describe('isLocalOrTarExporter', () => {
  test.each([
    [['type=registry,ref=user/app'], false],
    [['type=docker'], false],
    [['type=local,dest=./release-out'], true],
    [['type=tar,dest=/tmp/image.tar'], true],
    [['type=docker', 'type=tar,dest=/tmp/image.tar'], true],
    [['"type=tar","dest=/tmp/image.tar"'], true],
    [['" type= local" , dest=./release-out'], true],
    [['.'], true]
  ])('given %p returns %p', async (outputs: Array<string>, expected: boolean) => {
    expect(buildx.isLocalOrTarExporter(outputs)).toEqual(expected);
  });
});

describe('isAvailable', () => {
  const execSpy = jest.spyOn(exec, 'getExecOutput');
  buildx.isAvailable();

  // eslint-disable-next-line jest/no-standalone-expect
  expect(execSpy).toHaveBeenCalledWith(`docker`, ['buildx'], {
    silent: true,
    ignoreReturnCode: true
  });
});

describe('isAvailable standalone', () => {
  const execSpy = jest.spyOn(exec, 'getExecOutput');
  buildx.isAvailable(true);

  // eslint-disable-next-line jest/no-standalone-expect
  expect(execSpy).toHaveBeenCalledWith(`buildx`, [], {
    silent: true,
    ignoreReturnCode: true
  });
});

describe('getVersion', () => {
  it('valid', async () => {
    const version = await buildx.getVersion();
    expect(semver.valid(version)).not.toBeNull();
  });
});

describe('parseVersion', () => {
  test.each([
    ['github.com/docker/buildx 0.4.1+azure bda4882a65349ca359216b135896bddc1d92461c', '0.4.1'],
    ['github.com/docker/buildx v0.4.1 bda4882a65349ca359216b135896bddc1d92461c', '0.4.1'],
    ['github.com/docker/buildx v0.4.2 fb7b670b764764dc4716df3eba07ffdae4cc47b2', '0.4.2'],
    ['github.com/docker/buildx f117971 f11797113e5a9b86bd976329c5dbb8a8bfdfadfa', 'f117971']
  ])('given %p', async (stdout, expected) => {
    expect(buildx.parseVersion(stdout)).toEqual(expected);
  });
});

describe('satisfies', () => {
  test.each([
    ['0.4.1', '>=0.3.2', true],
    ['bda4882a65349ca359216b135896bddc1d92461c', '>0.1.0', false],
    ['f117971', '>0.6.0', true]
  ])('given %p', async (version, range, expected) => {
    expect(buildx.satisfies(version, range)).toBe(expected);
  });
});

describe('getSecret', () => {
  test.each([
    ['A_SECRET=abcdef0123456789', false, 'A_SECRET', 'abcdef0123456789', false],
    ['GIT_AUTH_TOKEN=abcdefghijklmno=0123456789', false, 'GIT_AUTH_TOKEN', 'abcdefghijklmno=0123456789', false],
    ['MY_KEY=c3RyaW5nLXdpdGgtZXF1YWxzCg==', false, 'MY_KEY', 'c3RyaW5nLXdpdGgtZXF1YWxzCg==', false],
    ['aaaaaaaa', false, '', '', true],
    ['aaaaaaaa=', false, '', '', true],
    ['=bbbbbbb', false, '', '', true],
    [`foo=${path.join(__dirname, 'fixtures', 'secret.txt').split(path.sep).join(path.posix.sep)}`, true, 'foo', 'bar', false],
    [`notfound=secret`, true, '', '', true]
  ])('given %p key and %p secret', async (kvp, file, exKey, exValue, invalid) => {
    try {
      let secret: string;
      if (file) {
        secret = await buildx.getSecretFile(kvp);
      } else {
        secret = await buildx.getSecretString(kvp);
      }
      expect(true).toBe(!invalid);
      expect(secret).toEqual(`id=${exKey},src=${tmpNameSync}`);
      expect(fs.readFileSync(tmpNameSync, 'utf-8')).toEqual(exValue);
    } catch (err) {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(true).toBe(invalid);
    }
  });
});
