import fs from 'fs';
import * as buildx from '../src/buildx';

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
