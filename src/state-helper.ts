import * as core from '@actions/core';

import {Inputs, sanitizeInputs} from './context';

export const tmpDir = process.env['STATE_tmpDir'] || '';
export const inputs = process.env['STATE_inputs'] ? JSON.parse(process.env['STATE_inputs']) : undefined;
export const buildRef = process.env['STATE_buildRef'] || '';
export const isSummarySupported = !!process.env['STATE_isSummarySupported'];

export function setTmpDir(tmpDir: string) {
  core.saveState('tmpDir', tmpDir);
}

export function setInputs(inputs: Inputs) {
  core.saveState('inputs', JSON.stringify(sanitizeInputs(inputs)));
}

export function setBuildRef(buildRef: string) {
  core.saveState('buildRef', buildRef);
}

export function setSummarySupported() {
  core.saveState('isSummarySupported', 'true');
}
