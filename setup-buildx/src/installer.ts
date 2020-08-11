import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import * as util from 'util';
import * as github from './github';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

const osPlat: string = os.platform();

export async function buildx(inputVersion: string, dockerConfigHome: string): Promise<string> {
  const release: github.GitHubRelease | null = await github.getRelease(inputVersion);
  if (!release) {
    throw new Error(`Cannot find buildx ${inputVersion} release`);
  }
  core.debug(`Release found: ${release.tag_name}`);
  const version = release.tag_name.replace(/^v+|v+$/g, '');

  let toolPath: string;
  toolPath = tc.find('buildx', version);
  if (!toolPath) {
    const c = semver.clean(version) || '';
    if (!semver.valid(c)) {
      throw new Error(`Invalid Buildx version "${version}".`);
    }
    toolPath = await installBuildx(version);
  }

  const pluginsDir: string = path.join(dockerConfigHome, 'cli-plugins');
  core.debug(`Plugins dir is ${pluginsDir}`);
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, {recursive: true});
  }

  const filename: string = osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx';
  const pluginPath: string = path.join(pluginsDir, filename);
  core.debug(`Plugin path is ${pluginPath}`);
  fs.copyFileSync(path.join(toolPath, filename), pluginPath);

  core.info('🔨 Fixing perms...');
  fs.chmodSync(pluginPath, '0755');

  return pluginPath;
}

async function installBuildx(version: string): Promise<string> {
  version = semver.clean(version) || '';
  const platform: string = osPlat == 'win32' ? 'windows' : osPlat;
  const ext: string = osPlat == 'win32' ? '.exe' : '';
  const filename: string = util.format('buildx-v%s.%s-amd64%s', version, platform, ext);
  const targetFile: string = osPlat == 'win32' ? 'docker-buildx.exe' : 'docker-buildx';

  const downloadUrl = util.format('https://github.com/docker/buildx/releases/download/v%s/%s', version, filename);
  let downloadPath: string;

  try {
    core.info(`⬇️ Downloading ${downloadUrl}...`);
    downloadPath = await tc.downloadTool(downloadUrl);
    core.debug(`Downloaded to ${downloadPath}`);
  } catch (error) {
    throw error;
  }

  return await tc.cacheFile(downloadPath, targetFile, 'buildx', version);
}
