#!/usr/bin/env bash
#
# delete-old-tags.sh
#
# USAGE
#   chmod +x delete-old-tags.sh
#   ./delete-old-tags.sh
#
# NOTES
#   • Assumes your fork’s remote is called “origin”.
#   • Safe to re-run; it silently ignores tags that are already gone.
#   • Groups remote deletions in batches of ≤50 so the push command line
#     never gets too long.

set -euo pipefail

TAGS=$(cat <<'EOF'
v6.15.0
v6.14.0
EOF
)

#######################################
# 1. Delete the tags locally
#######################################
for tag in $TAGS; do
  git tag -d "$tag" 2>/dev/null || true
done

#######################################
# 2. Delete them on GitHub (origin)
#    – push in batches of 50
#######################################
batch=()
count=0
for tag in $TAGS; do
  batch+=(":refs/tags/$tag")
  ((count++))
  if (( count == 50 )); then
    git push origin "${batch[@]}"
    batch=()
    count=0
  fi
done
# push any remainder
if (( ${#batch[@]} )); then
  git push origin "${batch[@]}"
fi

echo "✅  All listed tags have been removed locally and on origin."

