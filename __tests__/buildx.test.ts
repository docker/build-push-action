import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import * as buildx from '../src/buildx';
import * as exec from '@actions/exec';
import * as context from '../src/context';

const digest = 'sha256:bfb45ab72e46908183546477a08f8867fc40cebadd00af54b071b097aed127a9';

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

describe('getImageID', () => {
  it('matches', async () => {
    const imageIDFile = await buildx.getImageIDFile();
    console.log(`imageIDFile: ${imageIDFile}`);
    await fs.writeFileSync(imageIDFile, digest);
    const imageID = await buildx.getImageID();
    console.log(`imageID: ${imageID}`);
    expect(imageID).toEqual(digest);
  });
});

describe('isLocalOrTarExporter', () => {
  // prettier-ignore
  test.each([
    [
      [
        'type=registry,ref=user/app',
      ],
      false
    ],
    [
      [
        'type=docker',
      ],
      false
    ],
    [
      [
        'type=local,dest=./release-out'
      ],
      true
    ],
    [
      [
        'type=tar,dest=/tmp/image.tar'
      ],
      true
    ],
    [
      [
        'type=docker',
        'type=tar,dest=/tmp/image.tar'
      ],
      true
    ],
    [
      [
        '"type=tar","dest=/tmp/image.tar"'
      ],
      true
    ],
    [
      [
        '" type= local" , dest=./release-out'
      ],
      true
    ],
    [
      [
        '.'
      ],
      false
    ],
  ])(
    'given %p returns %p',
    async (outputs: Array<string>, expected: boolean) => {
      expect(buildx.isLocalOrTarExporter(outputs)).toEqual(expected);
    }
  );
});

describe('getVersion', () => {
  it('valid', async () => {
    await exec.exec('docker', ['buildx', 'version']);
    const version = await buildx.getVersion();
    console.log(`version: ${version}`);
    expect(semver.valid(version)).not.toBeNull();
  }, 100000);
});

describe('parseVersion', () => {
  test.each([
    ['github.com/docker/buildx 0.4.1+azure bda4882a65349ca359216b135896bddc1d92461c', '0.4.1'],
    ['github.com/docker/buildx v0.4.1 bda4882a65349ca359216b135896bddc1d92461c', '0.4.1'],
    ['github.com/docker/buildx v0.4.2 fb7b670b764764dc4716df3eba07ffdae4cc47b2', '0.4.2']
  ])('given %p', async (stdout, expected) => {
    expect(await buildx.parseVersion(stdout)).toEqual(expected);
  });
});
