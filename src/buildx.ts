import fs from 'fs';
import path from 'path';
import os from 'os';
import * as exec from './exec';

interface DockerConfig {
  credsStore?: string;
  experimental?: string;
  stackOrchestrator?: string;
  aliases?: {
    builder?: string;
  };
}

export async function isAvailable(): Promise<Boolean> {
  return await exec.exec(`docker`, ['buildx'], true).then(res => {
    if (res.stderr != '' && !res.success) {
      return false;
    }
    return res.success;
  });
}

export async function isInstalled(): Promise<Boolean> {
  const dockerHome: string = process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker');

  const dockerCfgFile: string = path.join(dockerHome, 'config.json');
  if (!fs.existsSync(dockerCfgFile)) {
    return false;
  }

  const dockerCfg: DockerConfig = JSON.parse(fs.readFileSync(dockerCfgFile, {encoding: 'utf-8'}));
  return dockerCfg.aliases?.builder == 'buildx';
}

export async function use(builder: string): Promise<void> {
  return await exec.exec(`docker`, ['buildx', 'use', '--builder', builder], false).then(res => {
    if (res.stderr != '' && !res.success) {
      throw new Error(res.stderr);
    }
  });
}
