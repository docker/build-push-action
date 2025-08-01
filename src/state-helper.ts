import * as core from '@actions/core';

import {Inputs, sanitizeInputs} from './context';

export const tmpDir = process.env['STATE_tmpDir'] || '';
export const inputs = process.env['STATE_inputs'] ? JSON.parse(process.env['STATE_inputs']) : undefined;
export const buildRef = process.env['STATE_buildRef'] || '';
export const isSummarySupported = !!process.env['STATE_isSummarySupported'];
export const blacksmithDockerBuildId = process.env['STATE_blacksmithDockerBuildId'] || '';
export const blacksmithClientKey = process.env['STATE_blacksmithClientKey'] || '';
export const blacksmithClientCaCertificate = process.env['STATE_blacksmithClientCaCertificate'] || '';
export const blacksmithRootCaCertificate = process.env['STATE_blacksmithRootCaCertificate'] || '';
export const dockerBuildStatus = process.env['STATE_dockerBuildStatus'] || '';
export const blacksmithBuilderLaunchTime = process.env['STATE_blacksmithBuilderLaunchTime'] || '';
export const dockerBuildDurationSeconds = process.env['STATE_dockerBuildDurationSeconds'] || '';

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

export function setBlacksmithDockerBuildId(blacksmithDockerBuildId: string) {
  core.saveState('blacksmithDockerBuildId', blacksmithDockerBuildId);
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

export function setDockerBuildStatus(dockerBuildStatus: string) {
  core.saveState('dockerBuildStatus', dockerBuildStatus);
}

export function setDockerBuildDurationSeconds(dockerBuildDurationSeconds: string) {
  core.saveState('dockerBuildDurationSeconds', dockerBuildDurationSeconds);
}
