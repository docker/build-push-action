import * as core from '@actions/core';
import * as reporter from './reporter';

/**
 * Reports the build start to the Blacksmith API and returns build tracking information.
 * @param dockerfilePath - Path to the Dockerfile being built
 * @returns Build information including docker_build_id, or null if reporting fails
 */
export async function reportBuildStart(dockerfilePath: string): Promise<{docker_build_id: string} | null> {
  try {
    const buildResponse = await reporter.reportBuild(dockerfilePath);
    return buildResponse;
  } catch (error) {
    core.warning(`Error reporting build start: ${(error as Error).message}`);
    return null;
  }
}