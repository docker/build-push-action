import {describe, expect, it, jest} from '@jest/globals';
import * as docker from '../src/docker';
import * as exec from '@actions/exec';

describe('isAvailable', () => {
  it('cli', () => {
    const execSpy = jest.spyOn(exec, 'getExecOutput');
    docker.isAvailable();

    // eslint-disable-next-line jest/no-standalone-expect
    expect(execSpy).toHaveBeenCalledWith(`docker`, undefined, {
      silent: true,
      ignoreReturnCode: true
    });
  });
});
