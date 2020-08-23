import fs from 'fs';
import path from 'path';
import * as semver from 'semver';
import * as context from './context';
import * as exec from './exec';

export async function getImageIDFile(): Promise<string> {
  return path.join(context.tmpDir, 'iidfile');
}

export async function getImageID(): Promise<string | undefined> {
  const iidFile = await getImageIDFile();
  if (!fs.existsSync(iidFile)) {
    return undefined;
  }
  return fs.readFileSync(iidFile, {encoding: 'utf-8'});
}

export async function isAvailable(): Promise<Boolean> {
  return await exec.exec(`docker`, ['buildx'], true).then(res => {
    if (res.stderr != '' && !res.success) {
      return false;
    }
    return res.success;
  });
}

export async function getVersion(): Promise<string> {
  return await exec.exec(`docker`, ['buildx', 'version'], true).then(res => {
    if (res.stderr != '' && !res.success) {
      throw new Error(res.stderr);
    }
    return parseVersion(res.stdout);
  });
}

export async function parseVersion(stdout: string): Promise<string> {
  const matches = /\sv?([0-9.]+)/.exec(stdout);
  if (!matches) {
    throw new Error(`Cannot parse Buildx version`);
  }
  return semver.clean(matches[1]);
}

export async function use(builder: string): Promise<void> {
  return await exec.exec(`docker`, ['buildx', 'use', '--builder', builder], false).then(res => {
    if (res.stderr != '' && !res.success) {
      throw new Error(res.stderr);
    }
  });
}
