import * as core from '@actions/core';
import * as main from '../main';
import * as reporter from '../reporter';
import {getDockerfilePath} from '../context';

jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  saveState: jest.fn(),
  getState: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  error: jest.fn()
}));

jest.mock('../context', () => ({
  getDockerfilePath: jest.fn(),
  Inputs: jest.fn()
}));

jest.mock('../reporter', () => {
  const actual = jest.requireActual('../reporter');
  return {
    ...actual,
    reportBuildPushActionFailure: jest.fn().mockResolvedValue(undefined),
    reportBuild: jest.fn()
  };
});

describe('reportBuildMetrics', () => {
  let mockInputs;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInputs = {
      nofallback: false,
      setupOnly: false,
      platforms: []
    };
  });

  test('should handle missing dockerfile path', async () => {
    (getDockerfilePath as jest.Mock).mockReturnValue(null);

    const result = await main.reportBuildMetrics(mockInputs);

    expect(result).toBeNull();
    expect(core.warning).toHaveBeenCalledWith('Error during build metrics reporting: Failed to resolve dockerfile path');
    expect(reporter.reportBuildPushActionFailure).toHaveBeenCalledWith(new Error('Failed to resolve dockerfile path'), 'reporting build metrics');
  });

  test('should successfully report build start', async () => {
    const mockBuildId = 'test-build-id';
    (getDockerfilePath as jest.Mock).mockReturnValue('/path/to/Dockerfile');
    (reporter.reportBuild as jest.Mock).mockResolvedValue({ docker_build_id: mockBuildId });

    const result = await main.reportBuildMetrics(mockInputs);

    expect(result).toBe(mockBuildId);
    expect(reporter.reportBuild).toHaveBeenCalledWith('/path/to/Dockerfile');
    expect(reporter.reportBuildPushActionFailure).not.toHaveBeenCalled();
  });

  test('should handle reportBuildStart returning null', async () => {
    (getDockerfilePath as jest.Mock).mockReturnValue('/path/to/Dockerfile');
    (reporter.reportBuild as jest.Mock).mockResolvedValue(null);

    const result = await main.reportBuildMetrics(mockInputs);

    expect(result).toBeNull();
    expect(reporter.reportBuild).toHaveBeenCalledWith('/path/to/Dockerfile');
    expect(reporter.reportBuildPushActionFailure).not.toHaveBeenCalled();
  });

  test('should handle error in reportBuildStart', async () => {
    (getDockerfilePath as jest.Mock).mockReturnValue('/path/to/Dockerfile');
    (reporter.reportBuild as jest.Mock).mockRejectedValue(new Error('API error'));

    const result = await main.reportBuildMetrics(mockInputs);

    expect(result).toBeNull();
    expect(core.warning).toHaveBeenCalledWith('Error reporting build start: API error');
    expect(reporter.reportBuildPushActionFailure).not.toHaveBeenCalled();
  });
});
