import * as exec from './exec';

export async function isDaemonRunning(): Promise<boolean> {
  return await exec.exec(`docker`, ['version', '--format', '{{.Server.Os}}'], true).then(res => {
    return !res.stdout.includes(' ') && res.success;
  });
}
