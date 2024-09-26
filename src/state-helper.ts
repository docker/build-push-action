import * as core from '@actions/core';

import {Inputs, sanitizeInputs} from './context';

export const tmpDir = process.env['STATE_tmpDir'] || '';
export const inputs = process.env['STATE_inputs'] ? JSON.parse(process.env['STATE_inputs']) : undefined;
export const buildRef = process.env['STATE_buildRef'] || '';
export const isSummarySupported = !!process.env['STATE_isSummarySupported'];
export const blacksmithBuildTaskId = process.env['STATE_blacksmithBuildTaskId'] || '';
export const blacksmithClientKey = process.env['STATE_blacksmithClientKey'] || '';
export const blacksmithClientCaCertificate = process.env['STATE_blacksmithClientCaCertificate'] || '';
export const blacksmithRootCaCertificate = process.env['STATE_blacksmithRootCaCertificate'] || '';
export const remoteDockerBuildStatus = process.env['STATE_remoteDockerBuildStatus'] || '';
export const blacksmithBuilderLaunchTime = process.env['STATE_blacksmithBuilderLaunchTime'] || '';

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

export function setBlacksmithBuildTaskId(blacksmithBuildTaskId: string) {
  core.saveState('blacksmithBuildTaskId', blacksmithBuildTaskId);
}

// setBlacksmithBuilderLaunchTime sets the time (in seconds) it took to launch the Blacksmith builder
export function setBlacksmithBuilderLaunchTime(blacksmithBuilderLaunchTime: string) {
  core.saveState('blacksmithBuilderLaunchTime', blacksmithBuilderLaunchTime);
}

export function setBlacksmithClientKey(blacksmithClientKey: string) {
  core.saveState('blacksmithClientKey', blacksmithClientKey);
}

export function setBlacksmithClientCaCertificate(blacksmithClientCaCertificate: string) {
  core.saveState('blacksmithClientCaCertificate', blacksmithClientCaCertificate);
}

export function setBlacksmithRootCaCertificate(blacksmithRootCaCertificate: string) {
  core.saveState('blacksmithRootCaCertificate', blacksmithRootCaCertificate);
}

export function setRemoteDockerBuildStatus(remoteDockerBuildStatus: string) {
  core.saveState('remoteDockerBuildStatus', remoteDockerBuildStatus);
}
