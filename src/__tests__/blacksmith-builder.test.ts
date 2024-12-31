import * as core from '@actions/core';
import * as main from '../main';
import * as reporter from '../reporter';
import {getDockerfilePath} from '../context';
import * as setupBuilder from '../setup_builder';
import { Metric_MetricType } from "@buf/blacksmith_vm-agent.bufbuild_es/stickydisk/v1/stickydisk_pb";

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
    reportMetric: jest.fn().mockImplementation((type: Metric_MetricType) => Promise.resolve())
  };
});

jest.mock('../setup_builder', () => ({
  ...jest.requireActual('../setup_builder'),
  startAndConfigureBuildkitd: jest.fn(),
  setupStickyDisk: jest.fn(),
  getNumCPUs: jest.fn().mockResolvedValue(4)
}));

describe('startBlacksmithBuilder', () => {
  let mockInputs;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInputs = {nofallback: false};
  });

  test('should handle missing dockerfile path with nofallback=false', async () => {
    (getDockerfilePath as jest.Mock).mockReturnValue(null);

    const result = await main.startBlacksmithBuilder(mockInputs);

    expect(result).toEqual({addr: null, buildId: null, exposeId: ''});
    expect(core.warning).toHaveBeenCalledWith('Error during Blacksmith builder setup: Failed to resolve dockerfile path. Falling back to a local build.');
    expect(reporter.reportBuildPushActionFailure).toHaveBeenCalledWith(new Error('Failed to resolve dockerfile path'), 'starting blacksmith builder');
  });

  test('should handle missing dockerfile path with nofallback=true', async () => {
    (getDockerfilePath as jest.Mock).mockReturnValue(null);
    mockInputs.nofallback = true;

    await expect(main.startBlacksmithBuilder(mockInputs)).rejects.toThrow('Failed to resolve dockerfile path');
    expect(core.warning).toHaveBeenCalledWith('Error during Blacksmith builder setup: Failed to resolve dockerfile path. Failing the build because nofallback is set.');
    expect(reporter.reportBuildPushActionFailure).toHaveBeenCalledWith(new Error('Failed to resolve dockerfile path'), 'starting blacksmith builder');
  });

  test('should handle error in setupStickyDisk with nofallback=false', async () => {
    (getDockerfilePath as jest.Mock).mockReturnValue('/path/to/Dockerfile');
    (setupBuilder.setupStickyDisk as jest.Mock).mockRejectedValue(new Error('Failed to obtain Blacksmith builder'));

    mockInputs.nofallback = false;
    const result = await main.startBlacksmithBuilder(mockInputs);

    expect(result).toEqual({addr: null, buildId: null, exposeId: ''});
    expect(core.warning).toHaveBeenCalledWith('Error during Blacksmith builder setup: Failed to obtain Blacksmith builder. Falling back to a local build.');
    expect(reporter.reportBuildPushActionFailure).toHaveBeenCalledWith(new Error('Failed to obtain Blacksmith builder'), 'starting blacksmith builder');
  });

  test('should handle error in setupStickyDisk with nofallback=true', async () => {
    (getDockerfilePath as jest.Mock).mockReturnValue('/path/to/Dockerfile');
    const error = new Error('Failed to obtain Blacksmith builder');
    (setupBuilder.setupStickyDisk as jest.Mock).mockRejectedValue(error);
    mockInputs.nofallback = true;

    await expect(main.startBlacksmithBuilder(mockInputs)).rejects.toThrow(error);
    expect(core.warning).toHaveBeenCalledWith('Error during Blacksmith builder setup: Failed to obtain Blacksmith builder. Failing the build because nofallback is set.');
    expect(reporter.reportBuildPushActionFailure).toHaveBeenCalledWith(error, 'starting blacksmith builder');
  });

  test('should successfully start buildkitd when setup succeeds', async () => {
    const mockBuildkitdAddr = 'unix:///run/buildkit/buildkitd.sock';
    const mockExposeId = 'test-expose-id';
    const mockBuildId = 'test-build-id';
    const mockDevice = '/dev/vdb';
    const mockParallelism = 4;

    (getDockerfilePath as jest.Mock).mockReturnValue('/path/to/Dockerfile');
    (setupBuilder.setupStickyDisk as jest.Mock).mockResolvedValue({
      device: mockDevice,
      buildId: mockBuildId,
      exposeId: mockExposeId
    });
    (setupBuilder.getNumCPUs as jest.Mock).mockResolvedValue(mockParallelism);
    (setupBuilder.startAndConfigureBuildkitd as jest.Mock).mockResolvedValue(mockBuildkitdAddr);

    const result = await main.startBlacksmithBuilder(mockInputs);

    expect(result).toEqual({
      addr: mockBuildkitdAddr,
      buildId: mockBuildId,
      exposeId: mockExposeId
    });
    expect(setupBuilder.startAndConfigureBuildkitd).toHaveBeenCalledWith(mockParallelism);
    expect(reporter.reportBuildPushActionFailure).not.toHaveBeenCalled();
  });

  test('should handle buildkitd startup failure with nofallback=false', async () => {
    const mockDevice = '/dev/vdb';
    const mockParallelism = 4;
    (getDockerfilePath as jest.Mock).mockReturnValue('/path/to/Dockerfile');
    (setupBuilder.setupStickyDisk as jest.Mock).mockResolvedValue({
      device: mockDevice,
      buildId: 'test-build-id',
      exposeId: 'test-expose-id'
    });
    (setupBuilder.getNumCPUs as jest.Mock).mockResolvedValue(mockParallelism);
    (setupBuilder.startAndConfigureBuildkitd as jest.Mock).mockRejectedValue(new Error('Failed to start buildkitd'));

    mockInputs.nofallback = false;
    const result = await main.startBlacksmithBuilder(mockInputs);

    expect(result).toEqual({addr: null, buildId: null, exposeId: ''});
    expect(core.warning).toHaveBeenCalledWith('Error during buildkitd setup: Failed to start buildkitd. Falling back to a local build.');
    expect(reporter.reportBuildPushActionFailure).toHaveBeenCalled();
  });

  test('should throw error when buildkitd fails and nofallback is true', async () => {
    const mockDevice = '/dev/vdb';
    const mockParallelism = 4;
    (getDockerfilePath as jest.Mock).mockReturnValue('/path/to/Dockerfile');
    (setupBuilder.setupStickyDisk as jest.Mock).mockResolvedValue({
      device: mockDevice,
      buildId: 'test-build-id',
      exposeId: 'test-expose-id'
    });
    (setupBuilder.getNumCPUs as jest.Mock).mockResolvedValue(mockParallelism);
    (setupBuilder.startAndConfigureBuildkitd as jest.Mock).mockRejectedValue(new Error('Failed to start buildkitd'));

    mockInputs.nofallback = true;
    await expect(main.startBlacksmithBuilder(mockInputs)).rejects.toThrow('Failed to start buildkitd');
    expect(core.warning).toHaveBeenCalledWith('Error during buildkitd setup: Failed to start buildkitd. Failing the build because nofallback is set.');
    expect(reporter.reportBuildPushActionFailure).toHaveBeenCalled();
  });
});
