import * as core from '@actions/core';

export const IsPost = !!process.env['STATE_isPost'];
export const builderName = process.env['STATE_builderName'] || '';

export function setBuilderName(builderName: string) {
  core.saveState('builderName', builderName);
}

if (!IsPost) {
  core.saveState('isPost', 'true');
}
