import axios, {AxiosError, AxiosInstance, AxiosResponse} from 'axios';
import * as core from '@actions/core';

export async function getBlacksmithAgentClient(): Promise<AxiosInstance> {
  const stickyDiskMgrUrl = 'http://192.168.127.1:5556';
  return axios.create({
    baseURL: stickyDiskMgrUrl
  });
}

export async function postWithRetry(client: AxiosInstance, url: string, formData: FormData, retryCondition: (error: AxiosError) => boolean): Promise<AxiosResponse> {
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

export async function postWithRetryToBlacksmithAPI(url: string, requestBody: unknown, retryCondition: (error: AxiosError) => boolean): Promise<AxiosResponse> {
  const maxRetries = 5;
  const retryDelay = 100;
  const apiUrl = process.env.BLACKSMITH_ENV?.includes('staging') ? 'https://stagingapi.blacksmith.sh' : 'https://api.blacksmith.sh';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const fullUrl = `${apiUrl}${url}`;
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
