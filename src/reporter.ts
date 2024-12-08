import * as core from '@actions/core';
import axios, {AxiosError, AxiosInstance, AxiosResponse} from 'axios';
import {ExportRecordResponse} from '@docker/actions-toolkit/lib/types/buildx/history';
import * as utils from './utils';

export async function reportBuilderCreationFailed(error?: Error) {
    const requestOptions = {
      stickydisk_key: process.env.GITHUB_REPO_NAME || '',
      repo_name: process.env.GITHUB_REPO_NAME || '',
      region: process.env.BLACKSMITH_REGION || 'eu-central',
      arch: process.env.BLACKSMITH_ENV?.includes('arm') ? 'arm64' : 'amd64',
      vm_id: process.env.VM_ID || '',
      petname: process.env.PETNAME || ''
    };
    const retryCondition = (error: AxiosError) => {
      return error.response?.status ? error.response.status > 500 : false;
    };
    const response = await postWithRetryToBlacksmithAPI('/stickydisks/report-failed', requestOptions, retryCondition);
    return response.data;
  }

export async function reportBuildCompleted(exportRes?: ExportRecordResponse, blacksmithDockerBuildId?: string | null, buildRef?: string, dockerBuildDurationSeconds?: string, exposeId?: string): Promise<void> {
  if (!blacksmithDockerBuildId) {
    core.warning('No docker build ID found, skipping build completion report');
    return;
  }

  try {
    const client = await utils.getBlacksmithAgentClient();
    const formData = new FormData();
    formData.append('shouldCommit', 'true');
    formData.append('vmID', process.env.VM_ID || '');
    formData.append('exposeID', exposeId || '');
    formData.append('stickyDiskKey', process.env.GITHUB_REPO_NAME || '');
    const retryCondition = (error: AxiosError) => {
      return error.response?.status ? error.response.status > 500 : false;
    };

    await postWithRetry(client, '/stickydisks', formData, retryCondition);

    // Report success to Blacksmith API
    const requestOptions = {
      docker_build_id: blacksmithDockerBuildId,
      conclusion: 'successful',
      runtime_seconds: dockerBuildDurationSeconds
    };

    if (exportRes) {
      let buildRefSummary;
      // Extract just the ref ID from the full buildRef path
      const refId = buildRef?.split('/').pop();
      core.info(`Using buildRef ID: ${refId}`);
      if (refId && exportRes.summaries[refId]) {
        buildRefSummary = exportRes.summaries[refId];
      } else {
        // Take first summary if buildRef not found
        const summaryKeys = Object.keys(exportRes.summaries);
        if (summaryKeys.length > 0) {
          buildRefSummary = exportRes.summaries[summaryKeys[0]];
        }
      }

      if (buildRefSummary) {
        const cachedRatio = buildRefSummary.numCachedSteps / buildRefSummary.numTotalSteps;
        requestOptions['cached_steps_ratio'] = cachedRatio;
      }
    }

    await postWithRetryToBlacksmithAPI(`/stickydisks/dockerbuilds/${blacksmithDockerBuildId}`, requestOptions, retryCondition);
    return;
  } catch (error) {
    core.warning('Error reporting build completed:', error);
    // We don't want to fail the build if this fails so we swallow the error
  }
}

export async function reportBuildFailed(dockerBuildId: string | null, dockerBuildDurationSeconds?: string, exposeId?: string | null): Promise<void> {
  if (!dockerBuildId) {
    core.warning('No docker build ID found, skipping build completion report');
    return;
  }

  try {
    const client = await utils.getBlacksmithAgentClient();
    const formData = new FormData();
    formData.append('shouldCommit', 'false');
    formData.append('vmID', process.env.VM_ID || '');
    formData.append('exposeID', exposeId || '');
    formData.append('stickyDiskKey', process.env.GITHUB_REPO_NAME || '');
    const retryCondition = (error: AxiosError) => {
      return error.response?.status ? error.response.status > 500 : false;
    };

    await postWithRetry(client, '/stickydisks', formData, retryCondition);

    // Report failure to Blacksmith API
    const requestOptions = {
      docker_build_id: dockerBuildId,
      conclusion: 'failed',
      runtime_seconds: dockerBuildDurationSeconds
    };

    await postWithRetryToBlacksmithAPI(`/stickydisks/dockerbuilds/${dockerBuildId}`, requestOptions, retryCondition);
    return;
  } catch (error) {
    core.warning('Error reporting build failed:', error);
    // We don't want to fail the build if this fails so we swallow the error
  }
}

// reportBuild reports the build to the Blacksmith API and returns the build ID
export async function reportBuild(dockerfilePath: string) {
  try {
    const requestBody = {
      dockerfile_path: dockerfilePath,
      repo_name: process.env.GITHUB_REPO_NAME || '',
      region: process.env.BLACKSMITH_REGION || 'eu-central',
      arch: process.env.BLACKSMITH_ENV?.includes('arm') ? 'arm64' : 'amd64',
      git_sha: process.env.GITHUB_SHA || '',
      vm_id: process.env.VM_ID || '',
      git_branch: process.env.GITHUB_REF_NAME || ''
    };
    core.debug(`Reporting build with options: ${JSON.stringify(requestBody, null, 2)}`);
    const retryCondition = (error: AxiosError) => {
      return error.response?.status ? error.response.status > 500 : false;
    };
    const response = await postWithRetryToBlacksmithAPI('/stickydisks/dockerbuilds', requestBody, retryCondition);
    return response.data;
  } catch (error) {
    const statusCode = (error as AxiosError)?.response?.status;
    core.warning(`Error reporting build to Blacksmith API (status: ${statusCode || 'unknown'}):`);
    core.warning(error);
    return null;
  }
}

async function postWithRetryToBlacksmithAPI(url: string, requestBody: unknown, retryCondition: (error: AxiosError) => boolean): Promise<AxiosResponse> {
  const maxRetries = 5;
  const retryDelay = 100;
  const apiUrl = process.env.BLACKSMITH_ENV?.includes('staging') ? 'https://stagingapi.blacksmith.sh' : 'https://api.blacksmith.sh';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      core.debug(`Request headers: Authorization: Bearer ${process.env.BLACKSMITH_STICKYDISK_TOKEN}, X-Github-Repo-Name: ${process.env.GITHUB_REPO_NAME || ''}`);

      const fullUrl = `${apiUrl}${url}`;
      core.debug(`Making request to full URL: ${fullUrl}`);

      return await axios.post(fullUrl, requestBody, {
        headers: {
          Authorization: `Bearer ${process.env.BLACKSMITH_STICKYDISK_TOKEN}`,
          'X-Github-Repo-Name': process.env.GITHUB_REPO_NAME || '',
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      if (attempt === maxRetries || !retryCondition(error as AxiosError)) {
        throw error;
      }
      core.warning(`Request failed, retrying (${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  throw new Error('Max retries reached');
}

async function postWithRetry(client: AxiosInstance, url: string, formData: FormData, retryCondition: (error: AxiosError) => boolean): Promise<AxiosResponse> {
  const maxRetries = 5;
  const retryDelay = 100;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.post(url, formData, {
        headers: {
          Authorization: `Bearer ${process.env.BLACKSMITH_STICKYDISK_TOKEN}`,
          'X-Github-Repo-Name': process.env.GITHUB_REPO_NAME || '',
          'Content-Type': 'multipart/form-data'
        }
      });
    } catch (error) {
      if (attempt === maxRetries || !retryCondition(error as AxiosError)) {
        throw error;
      }
      core.warning(`Request failed, retrying (${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  throw new Error('Max retries reached');
}

export async function getWithRetry(client: AxiosInstance, url: string, formData: FormData | null, retryCondition: (error: AxiosError) => boolean, options?: {signal?: AbortSignal}): Promise<AxiosResponse> {
  const maxRetries = 5;
  const retryDelay = 100;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (formData) {
        return await client.get(url, {
          data: formData,
          headers: {
            Authorization: `Bearer ${process.env.BLACKSMITH_STICKYDISK_TOKEN}`,
            'X-Github-Repo-Name': process.env.GITHUB_REPO_NAME || '',
            'Content-Type': 'multipart/form-data'
          },
          signal: options?.signal
        });
      }
      return await client.get(url, {signal: options?.signal});
    } catch (error) {
      if (attempt === maxRetries || !retryCondition(error as AxiosError)) {
        throw error;
      }
      core.warning(`Request failed, retrying (${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  throw new Error('Max retries reached');
}
