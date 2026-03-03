import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {vi} from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-build-push-action-'));

const githubPayload = {
  repository: {
    private: true
  }
};

const githubEventPath = path.join(tmpDir, 'github-event.json');
fs.writeFileSync(githubEventPath, JSON.stringify(githubPayload));

process.env = Object.assign({}, process.env, {
  TEMP: tmpDir,
  GITHUB_REPOSITORY: 'docker/build-push-action',
  GITHUB_REF: 'refs/heads/master',
  GITHUB_RUN_ID: '123456789',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_EVENT_PATH: githubEventPath,
  RUNNER_TEMP: path.join(tmpDir, 'runner-temp'),
  RUNNER_TOOL_CACHE: path.join(tmpDir, 'runner-tool-cache')
});

vi.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'docker',
      repo: 'build-push-action'
    },
    ref: 'refs/heads/master',
    runId: 123456789,
    payload: githubPayload
  },
  getOctokit: vi.fn()
}));
