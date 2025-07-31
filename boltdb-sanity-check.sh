#!/bin/bash
# BoltDB sanity check script to run before committing sticky disk

BUILDKIT_DIR="/var/lib/buildkit"
CORRUPTED=0

# Function to check if a BoltDB file is valid
check_boltdb() {
    local db_file="$1"
    
    if [ ! -f "$db_file" ]; then
        echo "WARN: $db_file does not exist"
        return 0
    fi
    
    # Check file size - 0 byte files are definitely corrupted
    size=$(stat -f%z "$db_file" 2>/dev/null || stat -c%s "$db_file" 2>/dev/null)
    if [ "$size" -eq 0 ]; then
        echo "ERROR: $db_file is 0 bytes - corrupted"
        return 1
    fi
    
    # Check BoltDB magic header (first 4 bytes should be 0xED0CDAED for little-endian)
    magic=$(od -N 4 -t x4 "$db_file" | head -1 | awk '{print $2}')
    if [ "$magic" != "ed0cdaed" ] && [ "$magic" != "edda0ced" ]; then
        echo "ERROR: $db_file has invalid BoltDB magic header: $magic"
        return 1
    fi
    
    # Check if file is readable
    if ! sudo head -c 4096 "$db_file" >/dev/null 2>&1; then
        echo "ERROR: $db_file is not readable"
        return 1
    fi
    
    echo "OK: $db_file appears valid (size: $size bytes)"
    return 0
}

echo "Checking BoltDB files in $BUILDKIT_DIR..."

for db in history.db cache.db snapshots.db metadata_v2.db containerdmeta.db; do
    db_path="$BUILDKIT_DIR/$db"
    if ! check_boltdb "$db_path"; then
        CORRUPTED=1
    fi
done

# Also check for any lock files that might indicate unclean shutdown
if ls $BUILDKIT_DIR/*.lock 2>/dev/null; then
    echo "WARN: Lock files found - buildkit may not have shutdown cleanly"
    CORRUPTED=1
fi

# Check for temp/new files that indicate incomplete operations
if ls $BUILDKIT_DIR/*-wal $BUILDKIT_DIR/*-shm $BUILDKIT_DIR/new-* 2>/dev/null; then
    echo "WARN: Temporary files found - buildkit may have incomplete operations"
    CORRUPTED=1
fi

if [ $CORRUPTED -eq 1 ]; then
    echo "CRITICAL: BoltDB corruption detected - DO NOT COMMIT STICKY DISK"
    exit 1
else
    echo "All BoltDB files appear healthy"
    exit 0
fi