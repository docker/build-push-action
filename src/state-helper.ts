import * as core from '@actions/core';

import {Build} from '@docker/actions-toolkit/lib/buildx/build';

import {Inputs} from './context';

export const tmpDir = process.env['STATE_tmpDir'] || '';

export const builderDriver = process.env['STATE_builderDriver'] || '';
export const builderEndpoint = process.env['STATE_builderEndpoint'] || '';
export const summaryInputs = process.env['STATE_summaryInputs'] ? JSON.parse(process.env['STATE_summaryInputs']) : undefined;

export const buildRef = process.env['STATE_buildRef'] || '';
export const isSummarySupported = !!process.env['STATE_isSummarySupported'];

export function setTmpDir(tmpDir: string) {
  core.saveState('tmpDir', tmpDir);
}

export function setBuilderDriver(builderDriver: string) {
  core.saveState('builderDriver', builderDriver);
}

export function setBuilderEndpoint(builderEndpoint: string) {
  core.saveState('builderEndpoint', builderEndpoint);
}

export function setBuildRef(buildRef: string) {
  core.saveState('buildRef', buildRef);
}

export function setSummarySupported() {
  core.saveState('isSummarySupported', 'true');
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
