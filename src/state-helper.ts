import * as core from '@actions/core';

export const tmpDir = process.env['STATE_tmpDir'] || '';
export const buildRef = process.env['STATE_buildRef'] || '';

export function setTmpDir(tmpDir: string) {
  core.saveState('tmpDir', tmpDir);
}

export function setBuildRef(buildRef: string) {
  core.saveState('buildRef', buildRef);
}
