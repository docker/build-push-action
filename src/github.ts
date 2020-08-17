import * as os from 'os';
import * as path from 'path';
import {Inputs} from './context';
import * as stateHelper from './state-helper';
import * as cache from '@actions/cache';
import * as core from '@actions/core';

const cachePath = path.join(os.tmpdir(), 'docker-build-push');

export async function restoreCache(inputs: Inputs): Promise<Inputs> {
  if (!inputs.cacheGithub) {
    return inputs;
  }

  const primaryKey = `${process.env.RUNNER_OS}-docker-build-push-${process.env.GITHUB_SHA}`;
  stateHelper.setCachePrimaryKey(primaryKey);

  try {
    const cacheKey = await cache.restoreCache([cachePath], primaryKey, [`${process.env.RUNNER_OS}-docker-build-push-`]);

    if (!cacheKey) {
      core.info(`GitHub Cache not found for key: ${primaryKey}`);
    } else {
      inputs.cacheFrom = [`type=local,src=${cachePath}`];
      stateHelper.setCacheMatchedKey(cacheKey);
      core.info(`GitHub Cache restored from key: ${cacheKey}`);
    }

    inputs.cacheTo = [`type=local,dest=${cachePath}`];
    return inputs;
  } catch (err) {
    if (err.name === cache.ValidationError.name) {
      throw err;
    } else {
      core.warning(err.message);
    }
  }

  return inputs;
}

export async function saveCache(inputs: Inputs): Promise<void> {
  if (!inputs.cacheGithub) {
    return;
  }

  if (!stateHelper.cachePrimaryKey) {
    core.warning(`Error retrieving GitHub Cache key from state.`);
    return;
  }

  if (stateHelper.isExactKeyMatch(stateHelper.cachePrimaryKey, stateHelper.cacheMatchedKey)) {
    core.info(`GitHub Cache hit occurred on the primary key ${stateHelper.cachePrimaryKey}, not saving cache.`);
    return;
  }

  try {
    await cache.saveCache([cachePath], stateHelper.cachePrimaryKey);
  } catch (err) {
    if (err.name === cache.ValidationError.name) {
      throw err;
    } else if (err.name === cache.ReserveCacheError.name) {
      core.info(err.message);
    } else {
      core.warning(err.message);
    }
  }
}
