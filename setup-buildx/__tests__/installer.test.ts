import fs = require('fs');
import * as installer from '../src/installer';
import * as path from 'path';
import * as os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghaction-docker-buildx-'));

describe('installer', () => {
  it('acquires v0.2.2 version of buildx', async () => {
    const buildx = await installer.buildx('v0.2.2', tmpDir);
    console.log(buildx);
    expect(fs.existsSync(buildx)).toBe(true);
  }, 100000);

  it('acquires latest version of buildx', async () => {
    const buildx = await installer.buildx('latest', tmpDir);
    console.log(buildx);
    expect(fs.existsSync(buildx)).toBe(true);
  }, 100000);
});
