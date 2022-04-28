import * as exec from '@actions/exec';

export async function isAvailable(): Promise<boolean> {
  return await exec
    .getExecOutput('docker', undefined, {
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
