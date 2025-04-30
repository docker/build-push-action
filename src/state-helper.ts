import * as core from '@actions/core';

import {Build} from '@docker/actions-toolkit/lib/buildx/build';

import {Inputs} from './context';

export const tmpDir = process.env['STATE_tmpDir'] || '';
export const buildRef = process.env['STATE_buildRef'] || '';
export const summaryType = process.env['STATE_summaryType'] || undefined;
export const summaryInputs = process.env['STATE_summaryInputs'] ? JSON.parse(process.env['STATE_summaryInputs']) : undefined;

export function setTmpDir(tmpDir: string) {
  core.saveState('tmpDir', tmpDir);
}

export function setBuildRef(buildRef: string) {
  core.saveState('buildRef', buildRef);
}

export function setSummaryType(summaryType: string) {
  core.saveState('summaryType', summaryType);
}

export function setSummaryInputs(inputs: Inputs) {
  const res = {};
  for (const key of Object.keys(inputs)) {
    if (key === 'github-token') {
      continue;
    }
    const value: string | string[] | boolean = inputs[key];
    if (typeof value === 'boolean' && !value) {
      continue;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      } else if (key === 'secrets' && value.length > 0) {
        const secretKeys: string[] = [];
        for (const secret of value) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const [skey, _] = Build.parseSecretKvp(secret, true);
            secretKeys.push(skey);
          } catch (err) {
            // ignore invalid secret
          }
        }
        if (secretKeys.length > 0) {
          res[key] = secretKeys;
        }
        continue;
      }
    } else if (!value) {
      continue;
    }
    res[key] = value;
  }
  core.saveState('summaryInputs', JSON.stringify(res));
}
