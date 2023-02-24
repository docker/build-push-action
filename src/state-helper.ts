import * as core from '@actions/core';

export const tmpDir = process.env['STATE_tmpDir'] || '';

export function setTmpDir(tmpDir: string) {
  core.saveState('tmpDir', tmpDir);
}
