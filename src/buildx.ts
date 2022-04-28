import {parse} from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import * as semver from 'semver';
import * as exec from '@actions/exec';

import * as context from './context';

export async function getImageIDFile(): Promise<string> {
  return path.join(context.tmpDir(), 'iidfile').split(path.sep).join(path.posix.sep);
}

export async function getImageID(): Promise<string | undefined> {
  const iidFile = await getImageIDFile();
  if (!fs.existsSync(iidFile)) {
    return undefined;
  }
  return fs.readFileSync(iidFile, {encoding: 'utf-8'}).trim();
}

export async function getMetadataFile(): Promise<string> {
  return path.join(context.tmpDir(), 'metadata-file').split(path.sep).join(path.posix.sep);
}

export async function getMetadata(): Promise<string | undefined> {
  const metadataFile = await getMetadataFile();
  if (!fs.existsSync(metadataFile)) {
    return undefined;
  }
  const content = fs.readFileSync(metadataFile, {encoding: 'utf-8'}).trim();
  if (content === 'null') {
    return undefined;
  }
  return content;
}

export async function getDigest(metadata: string | undefined): Promise<string | undefined> {
  if (metadata === undefined) {
    return undefined;
  }
  const metadataJSON = JSON.parse(metadata);
  if (metadataJSON['containerimage.digest']) {
    return metadataJSON['containerimage.digest'];
  }
  return undefined;
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

export function isLocalOrTarExporter(outputs: string[]): boolean {
  const records = parse(outputs.join(`\n`), {
    delimiter: ',',
    trim: true,
    columns: false,
    relaxColumnCount: true
  });
  for (const record of records) {
    // Local if no type is defined
    // https://github.com/docker/buildx/blob/d2bf42f8b4784d83fde17acb3ed84703ddc2156b/build/output.go#L29-L43
    if (record.length == 1 && !record[0].startsWith('type=')) {
      return true;
    }
    for (const [key, value] of record.map(chunk => chunk.split('=').map(item => item.trim()))) {
      if (key == 'type' && (value == 'local' || value == 'tar')) {
        return true;
      }
    }
  }
  return false;
}

export function hasGitAuthToken(secrets: string[]): boolean {
  for (const secret of secrets) {
    if (secret.startsWith('GIT_AUTH_TOKEN=')) {
      return true;
    }
  }
  return false;
}

export async function isAvailable(standalone?: boolean): Promise<boolean> {
  const cmd = getCommand([], standalone);
  return await exec
    .getExecOutput(cmd.command, cmd.args, {
      ignoreReturnCode: true,
      silent: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        return false;
      }
      return res.exitCode == 0;
    })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .catch(error => {
      return false;
    });
}

export async function getVersion(standalone?: boolean): Promise<string> {
  const cmd = getCommand(['version'], standalone);
  return await exec
    .getExecOutput(cmd.command, cmd.args, {
      ignoreReturnCode: true,
      silent: true
    })
    .then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
      return parseVersion(res.stdout.trim());
    });
}

export function parseVersion(stdout: string): string {
  const matches = /\sv?([0-9a-f]{7}|[0-9.]+)/.exec(stdout);
  if (!matches) {
    throw new Error(`Cannot parse buildx version`);
  }
  return matches[1];
}

export function satisfies(version: string, range: string): boolean {
  return semver.satisfies(version, range) || /^[0-9a-f]{7}$/.exec(version) !== null;
}

export function getCommand(args: Array<string>, standalone?: boolean) {
  return {
    command: standalone ? 'buildx' : 'docker',
    args: standalone ? args : ['buildx', ...args]
  };
}
