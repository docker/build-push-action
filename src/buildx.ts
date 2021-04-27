import csvparse from 'csv-parse/lib/sync';
import fs from 'fs';
import path from 'path';
import * as semver from 'semver';

import * as context from './context';
import * as exec from './exec';

export async function getImageIDFile(): Promise<string> {
  return path.join(context.tmpDir(), 'iidfile').split(path.sep).join(path.posix.sep);
}

export async function getImageID(): Promise<string | undefined> {
  const iidFile = await getImageIDFile();
  if (!fs.existsSync(iidFile)) {
    return undefined;
  }
  return fs.readFileSync(iidFile, {encoding: 'utf-8'});
}

export async function getSecretString(kvp: string): Promise<string> {
  return getSecret(kvp, false);
}

export async function getSecretFile(kvp: string): Promise<string> {
  return getSecret(kvp, true);
}

export async function getSecret(kvp: string, file: boolean): Promise<string> {
  const delimiterIndex = kvp.indexOf('=');
  const key = kvp.substring(0, delimiterIndex);
  let value = kvp.substring(delimiterIndex + 1);
  if (key.length == 0 || value.length == 0) {
    throw new Error(`${kvp} is not a valid secret`);
  }

  if (file) {
    if (!fs.existsSync(value)) {
      throw new Error(`secret file ${value} not found`);
    }
    value = fs.readFileSync(value, {encoding: 'utf-8'});
  }

  const secretFile = context.tmpNameSync({
    tmpdir: context.tmpDir()
  });
  fs.writeFileSync(secretFile, value);

  return `id=${key},src=${secretFile}`;
}

export function isLocalOrTarExporter(outputs: string[]): Boolean {
  for (let output of csvparse(outputs.join(`\n`), {
    delimiter: ',',
    trim: true,
    columns: false,
    relaxColumnCount: true
  })) {
    // Local if no type is defined
    // https://github.com/docker/buildx/blob/d2bf42f8b4784d83fde17acb3ed84703ddc2156b/build/output.go#L29-L43
    if (output.length == 1 && !output[0].startsWith('type=')) {
      return true;
    }
    for (let [key, value] of output.map(chunk => chunk.split('=').map(item => item.trim()))) {
      if (key == 'type' && (value == 'local' || value == 'tar')) {
        return true;
      }
    }
  }
  return false;
}

export function hasGitAuthToken(secrets: string[]): Boolean {
  for (let secret of secrets) {
    if (secret.startsWith('GIT_AUTH_TOKEN=')) {
      return true;
    }
  }
  return false;
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
    throw new Error(`Cannot parse buildx version`);
  }
  return semver.clean(matches[1]);
}
