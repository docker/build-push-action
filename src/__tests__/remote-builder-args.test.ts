import * as os from 'os';
import {getRemoteBuilderArgs, resolveRemoteBuilderPlatforms} from '../context';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}));

describe('Remote builder platform argument resolution', () => {
  const builderName = 'test-builder';
  const builderUrl = 'tcp://127.0.0.1:1234';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns comma-separated list when platforms are supplied', async () => {
    const platforms = ['linux/arm64', 'linux/amd64'];
    const platformStr = resolveRemoteBuilderPlatforms(platforms);
    expect(platformStr).toBe('linux/arm64,linux/amd64');

    const args = await getRemoteBuilderArgs(builderName, builderUrl, platforms);
    const idx = args.indexOf('--platform');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('linux/arm64,linux/amd64');
  });

  test('falls back to host architecture when no platforms supplied', async () => {
    jest.spyOn(os, 'arch').mockReturnValue('arm64' as any);

    const platformStr = resolveRemoteBuilderPlatforms([]);
    expect(platformStr).toBe('linux/arm64');

    const args = await getRemoteBuilderArgs(builderName, builderUrl, []);
    const idx = args.indexOf('--platform');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('linux/arm64');
  });
});
