# Buildkit Corruption Prevention Measures

## Immediate Fixes

### 1. Enhanced Buildkitd Shutdown Sequence
```typescript
// In shutdownBuildkitd() function
export async function shutdownBuildkitd(): Promise<void> {
  const startTime = Date.now();
  const timeout = 30000; // Increase to 30 seconds
  const backoff = 300;

  try {
    // First, try graceful shutdown with SIGTERM
    await execAsync(`sudo pkill -TERM buildkitd`);
    
    // Wait for graceful shutdown
    let gracefulShutdown = false;
    while (Date.now() - startTime < 10000) { // 10s for graceful
      try {
        await execAsync('pgrep buildkitd');
        await new Promise(resolve => setTimeout(resolve, backoff));
      } catch (error) {
        if (error.code === 1) {
          gracefulShutdown = true;
          break;
        }
      }
    }
    
    // If still running, force kill
    if (!gracefulShutdown) {
      core.warning('Buildkitd did not shutdown gracefully, forcing termination');
      await execAsync(`sudo pkill -KILL buildkitd`);
    }
    
    // Critical: Sync filesystem after buildkitd exits
    await execAsync('sync');
    
    // Double-check all buildkit processes are gone
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      await execAsync('pgrep -f buildkit');
      throw new Error('Buildkit processes still running after shutdown');
    } catch (error) {
      if (error.code !== 1) throw error;
    }
    
  } catch (error) {
    core.error('error shutting down buildkitd process:', error);
    throw error;
  }
}
```

### 2. Add Pre-Commit Validation
```typescript
// Add before committing sticky disk
async function validateBuildkitState(): Promise<void> {
  // Check no buildkit processes
  try {
    await execAsync('pgrep -f buildkit');
    throw new Error('Buildkit processes still running');
  } catch (error) {
    if (error.code !== 1) throw error;
  }
  
  // Verify database files are readable
  const dbFiles = [
    '/var/lib/buildkit/history.db',
    '/var/lib/buildkit/cache.db',
    '/var/lib/buildkit/snapshots.db'
  ];
  
  for (const dbFile of dbFiles) {
    try {
      await execAsync(`sudo file ${dbFile}`);
    } catch (error) {
      core.warning(`Database file ${dbFile} may be corrupted`);
    }
  }
  
  // Final sync
  await execAsync('sync');
  await new Promise(resolve => setTimeout(resolve, 2000));
}
```

### 3. Add Buildkit Health Checks During Build
```typescript
// Periodically check buildkit health during long builds
async function monitorBuildkitHealth(): Promise<void> {
  const interval = setInterval(async () => {
    try {
      const {stdout} = await execAsync(`sudo buildctl --addr ${BUILDKIT_DAEMON_ADDR} debug workers`);
      if (!stdout || stdout.trim().split('\n').length < 2) {
        core.warning('Buildkit workers unhealthy during build');
      }
    } catch (error) {
      core.warning(`Buildkit health check failed: ${error.message}`);
    }
  }, 30000); // Every 30 seconds
  
  return () => clearInterval(interval);
}
```

## Debug Information Collection

### 1. Capture Buildkit State Before Shutdown
```typescript
async function captureBuildkitDebugInfo(): Promise<void> {
  try {
    // Capture worker state
    await execAsync(`sudo buildctl --addr ${BUILDKIT_DAEMON_ADDR} debug workers > /tmp/buildkit-workers.log`);
    
    // Capture cache info
    await execAsync(`sudo buildctl --addr ${BUILDKIT_DAEMON_ADDR} du > /tmp/buildkit-du.log`);
    
    // Capture process info
    await execAsync('ps aux | grep buildkit > /tmp/buildkit-processes.log');
    
    // Capture filesystem state
    await execAsync(`ls -la /var/lib/buildkit/ > /tmp/buildkit-files.log`);
    await execAsync(`df -h /var/lib/buildkit > /tmp/buildkit-df.log`);
    
    // Capture database file info
    await execAsync('sudo file /var/lib/buildkit/*.db >> /tmp/buildkit-files.log');
    
  } catch (error) {
    core.debug(`Error capturing debug info: ${error.message}`);
  }
}
```

### 2. Add Database Corruption Detection
```typescript
async function checkDatabaseIntegrity(): Promise<boolean> {
  const dbFiles = [
    '/var/lib/buildkit/history.db',
    '/var/lib/buildkit/cache.db', 
    '/var/lib/buildkit/snapshots.db'
  ];
  
  for (const dbFile of dbFiles) {
    try {
      // Use bbolt tool if available to check integrity
      await execAsync(`sudo bbolt check ${dbFile}`);
    } catch (error) {
      core.warning(`Database ${dbFile} integrity check failed: ${error.message}`);
      
      // Try to backup corrupted file
      await execAsync(`sudo cp ${dbFile} ${dbFile}.corrupted-$(date +%s)`);
      return false;
    }
  }
  return true;
}
```

## Long-term Solutions

1. **Consider using buildkit's built-in persistence**:
   - Use `--oci-worker-snapshotter=native` instead of overlayfs
   - This may be more robust with block storage

2. **Implement proper database closure**:
   - Send specific shutdown signal that triggers proper BoltDB closure
   - Consider patching buildkit to add pre-shutdown hook

3. **Add retry mechanism for corrupted state**:
   - Detect corruption on startup
   - Automatically clean and retry with fresh state

4. **Monitor and alert on corruption patterns**:
   - Track frequency of different corruption types
   - Alert when corruption rate exceeds threshold