import * as core from '@actions/core';

export const IsPost = !!process.env['STATE_isPost'];
export const cachePrimaryKey = process.env['STATE_cachePrimaryKey'] || '';
export const cacheMatchedKey = process.env['STATE_cacheMatchedKey'] || '';

export function setCachePrimaryKey(cachePrimaryKey: string) {
  core.saveState('cachePrimaryKey', cachePrimaryKey);
}

export function setCacheMatchedKey(cacheMatchedKey: string) {
  core.saveState('cacheMatchedKey', cacheMatchedKey);
}

export function isExactKeyMatch(key: string, cacheKey?: string): boolean {
  return !!(
    cacheKey &&
    cacheKey.localeCompare(key, undefined, {
      sensitivity: 'accent'
    }) === 0
  );
}

if (!IsPost) {
  core.saveState('isPost', 'true');
}
