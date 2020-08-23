import fs from 'fs';
import * as semver from 'semver';
import * as buildx from '../src/buildx';
import * as exec from '@actions/exec';

const digest = 'sha256:bfb45ab72e46908183546477a08f8867fc40cebadd00af54b071b097aed127a9';

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
    ['github.com/docker/buildx v0.2.2 ab5fe3dec5785b8d0a7d2cf2499c38e504d4c609', '0.2.2'],
    ['github.com/docker/buildx v0.4.1 bda4882a65349ca359216b135896bddc1d92461c', '0.4.1'],
    ['github.com/docker/buildx v0.4.2 fb7b670b764764dc4716df3eba07ffdae4cc47b2', '0.4.2']
  ])('given %p', async (stdout, expected) => {
    expect(await buildx.parseVersion(stdout)).toEqual(expected);
  });
});
