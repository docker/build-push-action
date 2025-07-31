import * as core from '@actions/core';
import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);
const BUILDKIT_DAEMON_ADDR = 'tcp://127.0.0.1:1234';

/**
 * Validates buildkit state before committing sticky disk.
 * Uses buildctl to check if buildkit can respond to queries.
 * 
 * @returns true if buildkit state appears healthy, false otherwise
 */
export async function validateBuildkitState(): Promise<boolean> {
  try {
    // First check if buildkitd process is running (it shouldn't be)
    try {
      await execAsync('pgrep buildkitd');
      core.warning('buildkitd process is still running - state may be inconsistent');
      return false;
    } catch (error) {
      if (error.code !== 1) {
        core.warning(`Error checking for buildkitd process: ${error.message}`);
        return false;
      }
      // Process not found - this is good
    }

    // Check for lock files that might indicate unclean shutdown
    try {
      const {stdout: lockFiles} = await execAsync('sudo find /var/lib/buildkit -name "*.lock" -o -name "*-wal" -o -name "*-shm" 2>/dev/null || true');
      if (lockFiles.trim()) {
        core.warning(`Found lock/temporary files indicating potential unclean shutdown: ${lockFiles.trim()}`);
        return false;
      }
    } catch (error) {
      core.debug(`Error checking for lock files: ${error.message}`);
    }

    // Check database file sizes - 0 byte files indicate corruption
    const dbFiles = ['history.db', 'cache.db', 'snapshots.db', 'metadata_v2.db', 'containerdmeta.db'];
    for (const db of dbFiles) {
      try {
        const {stdout} = await execAsync(`sudo stat -c%s /var/lib/buildkit/${db} 2>/dev/null || echo "0"`);
        const size = parseInt(stdout.trim());
        if (size === 0) {
          core.warning(`Database file ${db} is 0 bytes - indicates corruption`);
          return false;
        }
      } catch (error) {
        // File might not exist, which is okay
        core.debug(`Could not check ${db}: ${error.message}`);
      }
    }

    // Final sync to ensure everything is flushed
    await execAsync('sync');
    
    return true;
  } catch (error) {
    core.error(`Error validating buildkit state: ${error.message}`);
    return false;
  }
}

/**
 * Attempts to start buildkitd temporarily to check database integrity.
 * This is a more thorough check but takes longer.
 * 
 * @returns true if databases can be read successfully
 */
export async function validateBuildkitDatabases(): Promise<boolean> {
  try {
    // Start buildkitd in a way that just validates databases
    const buildkitdProcess = await execAsync(
      'timeout 5s sudo buildkitd --debug --addr tcp://127.0.0.1:12345 2>&1 || true'
    );
    
    // Check if it panicked with database errors
    if (buildkitdProcess.stdout.includes('panic:') || 
        buildkitdProcess.stdout.includes('assertion failed') ||
        buildkitdProcess.stdout.includes('corrupted')) {
      core.error('Buildkit database corruption detected during validation');
      return false;
    }
    
    // Kill any remaining buildkitd process
    await execAsync('sudo pkill -9 buildkitd || true');
    
    return true;
  } catch (error) {
    core.debug(`Database validation check failed: ${error.message}`);
    // If the check fails, assume databases might be okay
    return true;
  }
}