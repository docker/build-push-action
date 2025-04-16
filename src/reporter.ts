import * as core from '@actions/core';
import axios, {AxiosError, AxiosInstance, AxiosResponse} from 'axios';
import axiosRetry from 'axios-retry';
import {ExportRecordResponse} from '@docker/actions-toolkit/lib/types/buildx/history';
import FormData from 'form-data';
import {createClient} from '@connectrpc/connect';
import {createGrpcTransport} from '@connectrpc/connect-node';
import {StickyDiskService} from '@buf/blacksmith_vm-agent.connectrpc_es/stickydisk/v1/stickydisk_connect';
import {Metric, Metric_MetricType} from '@buf/blacksmith_vm-agent.bufbuild_es/stickydisk/v1/stickydisk_pb';

// Configure base axios instance for Blacksmith API.
const createBlacksmithAPIClient = () => {
  const apiUrl = process.env.BLACKSMITH_BACKEND_URL || (process.env.BLACKSMITH_ENV?.includes('staging') ? 'https://stagingapi.blacksmith.sh' : 'https://api.blacksmith.sh');
  core.debug(`Using Blacksmith API URL: ${apiUrl}`);

  const client = axios.create({
    baseURL: apiUrl,
    headers: {
      Authorization: `Bearer ${process.env.BLACKSMITH_STICKYDISK_TOKEN}`,
      'X-Github-Repo-Name': process.env.GITHUB_REPO_NAME || '',
      'Content-Type': 'application/json'
    }
  });

  axiosRetry(client, {
    retries: 5,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error: AxiosError) => {
      return axiosRetry.isNetworkOrIdempotentRequestError(error) || (error.response?.status ? error.response.status >= 500 : false);
    }
  });

  return client;
};

export function createBlacksmithAgentClient() {
  const transport = createGrpcTransport({
    baseUrl: `http://192.168.127.1:${process.env.BLACKSMITH_STICKY_DISK_GRPC_PORT || '5557'}`,
    httpVersion: '2'
  });

  return createClient(StickyDiskService, transport);
}

export async function reportBuildPushActionFailure(error?: Error, event?: string, isWarning?: boolean) {
  const requestOptions = {
    stickydisk_key: process.env.GITHUB_REPO_NAME || '',
    repo_name: process.env.GITHUB_REPO_NAME || '',
    region: process.env.BLACKSMITH_REGION || 'eu-central',
    arch: process.env.BLACKSMITH_ENV?.includes('arm') ? 'arm64' : 'amd64',
    vm_id: process.env.VM_ID || '',
    petname: process.env.PETNAME || '',
    message: event ? `${event}: ${error?.message || ''}` : error?.message || '',
    warning: isWarning || false
  };

  const client = createBlacksmithAPIClient();
  const response = await client.post('/stickydisks/report-failed', requestOptions);
  return response.data;
}

export async function reportBuildCompleted(exportRes?: ExportRecordResponse, blacksmithDockerBuildId?: string | null, buildRef?: string, dockerBuildDurationSeconds?: string, exposeId?: string): Promise<void> {
  if (!blacksmithDockerBuildId) {
    core.warning('No docker build ID found, skipping build completion report');
    return;
  }

  try {
    const agentClient = createBlacksmithAgentClient();

    await agentClient.commitStickyDisk({
      exposeId: exposeId || '',
      stickyDiskKey: process.env.GITHUB_REPO_NAME || '',
      vmId: process.env.VM_ID || '',
      shouldCommit: true,
      repoName: process.env.GITHUB_REPO_NAME || '',
      stickyDiskToken: process.env.BLACKSMITH_STICKYDISK_TOKEN || ''
    });

    // Report success to Blacksmith API
    const requestOptions = {
      docker_build_id: blacksmithDockerBuildId,
      conclusion: 'successful',
      runtime_seconds: dockerBuildDurationSeconds
    };

    if (exportRes) {
      let buildRefSummary;
      const refId = buildRef?.split('/').pop();
      core.info(`Using buildRef ID: ${refId}`);
      if (refId && exportRes.summaries[refId]) {
        buildRefSummary = exportRes.summaries[refId];
      } else {
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

    const client = createBlacksmithAPIClient();
    await client.post(`/stickydisks/dockerbuilds/${blacksmithDockerBuildId}`, requestOptions);
  } catch (error) {
    core.warning('Error reporting build completed:', error);
  }
}

export async function reportBuildFailed(dockerBuildId: string | null, dockerBuildDurationSeconds?: string, exposeId?: string | null): Promise<void> {
  if (!dockerBuildId) {
    core.warning('No docker build ID found, skipping build completion report');
    return;
  }

  try {
    const blacksmithAgentClient = createBlacksmithAgentClient();
    await blacksmithAgentClient.commitStickyDisk({
      exposeId: exposeId || '',
      stickyDiskKey: process.env.GITHUB_REPO_NAME || '',
      vmId: process.env.VM_ID || '',
      shouldCommit: false,
      repoName: process.env.GITHUB_REPO_NAME || '',
      stickyDiskToken: process.env.BLACKSMITH_STICKYDISK_TOKEN || ''
    });

    // Report failure to Blacksmith API
    const requestOptions = {
      docker_build_id: dockerBuildId,
      conclusion: 'failed',
      runtime_seconds: dockerBuildDurationSeconds
    };

    const blacksmithAPIClient = createBlacksmithAPIClient();
    await blacksmithAPIClient.post(`/stickydisks/dockerbuilds/${dockerBuildId}`, requestOptions);
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
    const blacksmithAPIClient = createBlacksmithAPIClient();
    const response = await blacksmithAPIClient.post('/stickydisks/dockerbuilds', requestBody);
    return response.data;
  } catch (error) {
    const statusCode = (error as AxiosError)?.response?.status;
    core.warning(`Error reporting build to Blacksmith API (status: ${statusCode || 'unknown'}):`);
    core.warning(error);
    return null;
  }
}

export async function post(client: AxiosInstance, url: string, formData: FormData | null, options?: {signal?: AbortSignal}): Promise<AxiosResponse> {
  return await client.post(url, formData, {
    headers: {
      ...client.defaults.headers.common,
      ...(formData && {'Content-Type': 'multipart/form-data'})
    },
    signal: options?.signal
  });
}

export async function reportMetric(metricType: Metric_MetricType, value: number): Promise<void> {
  try {
    const agentClient = createBlacksmithAgentClient();

    const metric = new Metric({
      type: metricType,
      value: {case: 'intValue', value: BigInt(value)}
    });

    await agentClient.reportMetric({
      repoName: process.env.GITHUB_REPO_NAME || '',
      region: process.env.BLACKSMITH_REGION || 'eu-central',
      metric: metric
    });
  } catch (error) {
    // We can enable this once all agents are updated to support metrics.
    // core.warning('Error reporting metric to BlacksmithAgent:', error);
  }
}

export async function commitStickyDisk(exposeId?: string, shouldCommit: boolean = true): Promise<void> {
  try {
    const agentClient = createBlacksmithAgentClient();

    await agentClient.commitStickyDisk({
      exposeId: exposeId || '',
      stickyDiskKey: process.env.GITHUB_REPO_NAME || '',
      vmId: process.env.VM_ID || '',
      shouldCommit,
      repoName: process.env.GITHUB_REPO_NAME || '',
      stickyDiskToken: process.env.BLACKSMITH_STICKYDISK_TOKEN || ''
    });
  } catch (error) {
    core.warning('Error committing sticky disk:', error);
  }
}
