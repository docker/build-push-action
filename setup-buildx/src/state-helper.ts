// From https://github.com/actions/checkout/blob/master/src/state-helper.ts

import * as coreCommand from '@actions/core/lib/command';

/**
 * Indicates whether the POST action is running
 */
export const IsPost = !!process.env['STATE_isPost'];

// Publish a variable so that when the POST action runs, it can determine it should run the cleanup logic.
// This is necessary since we don't have a separate entry point.
if (!IsPost) {
  coreCommand.issueCommand('save-state', {name: 'isPost'}, 'true');
}
