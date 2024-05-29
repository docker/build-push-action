import * as core from '@actions/core';

import {BuilderInfo} from '@docker/actions-toolkit/lib/types/buildx/builder';

import {Inputs, sanitizeInputs} from './context';

export const tmpDir = process.env['STATE_tmpDir'] || '';
export const inputs = process.env['STATE_inputs'] ? JSON.parse(process.env['STATE_inputs']) : undefined;
export const builder = process.env['STATE_builder'] ? <BuilderInfo>JSON.parse(process.env['STATE_builder']) : undefined;
export const buildRef = process.env['STATE_buildRef'] || '';

export function setTmpDir(tmpDir: string) {
  core.saveState('tmpDir', tmpDir);
}

export function setInputs(inputs: Inputs) {
  core.saveState('inputs', JSON.stringify(sanitizeInputs(inputs)));
}

export function setBuilder(builder: BuilderInfo) {
  core.saveState('builder', JSON.stringify(builder));
}

export function setBuildRef(buildRef: string) {
  core.saveState('buildRef', buildRef);
}
