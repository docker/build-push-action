import fs = require('fs');
import * as buildx from '../src/buildx';
import * as path from 'path';
import * as os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-buildx-'));

describe('buildx', () => {
  it('is available', async () => {
    expect(await buildx.isAvailable()).toBe(true);
  });

  it('count builders', async () => {
    const countBuilders = await buildx.countBuilders();
    console.log(`countBuilders: ${countBuilders}`);
    expect(countBuilders).toBeGreaterThan(0);
  });

  it('acquires v0.2.2 version of buildx', async () => {
    const buildxBin = await buildx.install('v0.2.2', tmpDir);
    console.log(buildxBin);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);

  it('acquires latest version of buildx', async () => {
    const buildxBin = await buildx.install('latest', tmpDir);
    console.log(buildxBin);
    expect(fs.existsSync(buildxBin)).toBe(true);
  }, 100000);
});
