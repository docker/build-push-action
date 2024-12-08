import * as core from '@actions/core';
import * as main from '../main';
import * as reporter from '../reporter';
import {getDockerfilePath} from '../context';
import { getBuilderAddr } from '../setup_builder';

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

jest.mock('../reporter', () => ({
  reportBuilderCreationFailed: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../setup_builder', () => ({
  getBuilderAddr: jest.fn()
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
    expect(reporter.reportBuilderCreationFailed).toHaveBeenCalledWith(new Error('Failed to resolve dockerfile path'));
  });

  test('should handle missing dockerfile path with nofallback=true', async () => {
    (getDockerfilePath as jest.Mock).mockReturnValue(null);
    mockInputs.nofallback = true;

    await expect(main.startBlacksmithBuilder(mockInputs)).rejects.toThrow('Failed to resolve dockerfile path');
    expect(core.warning).not.toHaveBeenCalled();
    expect(reporter.reportBuilderCreationFailed).toHaveBeenCalledWith(new Error('Failed to resolve dockerfile path'));
  });

  test('should handle error in getBuilderAddr with nofallback=false', async () => {
    (getDockerfilePath as jest.Mock).mockReturnValue('/path/to/Dockerfile');
    (getBuilderAddr as jest.Mock).mockRejectedValue(new Error('Failed to obtain Blacksmith builder'));

    mockInputs.nofallback = false;
    const result = await main.startBlacksmithBuilder(mockInputs);

    expect(result).toEqual({addr: null, buildId: null, exposeId: ''});
    expect(core.warning).toHaveBeenCalledWith('Error during Blacksmith builder setup: Failed to obtain Blacksmith builder. Falling back to a local build.');
    expect(reporter.reportBuilderCreationFailed).toHaveBeenCalledWith(new Error('Failed to obtain Blacksmith builder'));
  });

  test('should handle error in getBuilderAddr with nofallback=true', async () => {
    (getDockerfilePath as jest.Mock).mockReturnValue('/path/to/Dockerfile');
    const error = new Error('Failed to obtain Blacksmith builder');
    (getBuilderAddr as jest.Mock).mockRejectedValue(error);
    mockInputs.nofallback = true;

    await expect(main.startBlacksmithBuilder(mockInputs)).rejects.toThrow(error);
    expect(core.warning).not.toHaveBeenCalled();
    expect(reporter.reportBuilderCreationFailed).toHaveBeenCalledWith(error);
  });
});
