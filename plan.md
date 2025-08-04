# Build-Push-Action Refactoring Plan

## Overview
Split the current `useblacksmith/build-push-action` into two separate actions:
1. `useblacksmith/setup-docker-builder` - Manages buildkitd lifecycle and stickydisk
2. `useblacksmith/build-push-action` - Focuses on Docker builds and metrics reporting

## Current Problems
- The existing action supports two modes: "setup-only" and normal mode
- Complex logic to manage buildkitd lifecycle across multiple invocations
- Buildkitd must be shut down after each build to support multiple builds in one job
- Post-action steps run in reverse order, complicating cleanup

## Proposed Architecture

### useblacksmith/setup-docker-builder
**Responsibilities:**
- Start buildkitd once per workflow job
- Mount stickydisk at `/var/lib/buildkit` for shared Docker layer cache
- Handle all cleanup, shutdown, and commit logic in post-action
- Manage the entire buildkitd lifecycle

**Key Features:**
- Single buildkitd instance for entire job
- All stickydisk logic centralized here
- Post-action handles:
  - Buildkitd shutdown
  - Stickydisk commit (conditional based on build success)
  - Cleanup

### useblacksmith/build-push-action
**Responsibilities:**
- Execute Docker builds against running buildkitd
- Report build metrics to control plane
- No buildkitd lifecycle management

**Key Features:**
- Simplified logic - just build and push
- Can be invoked multiple times in same job
- Focuses on Docker operations and telemetry

## Usage Patterns

### Multiple Dockerfiles
```yaml
- uses: useblacksmith/setup-docker-builder
- uses: useblacksmith/build-push-action  # dockerfile 1
- uses: useblacksmith/build-push-action  # dockerfile 2
- uses: useblacksmith/build-push-action  # dockerfile 3
```

### Custom Docker Commands
```yaml
- uses: useblacksmith/setup-docker-builder
- run: docker bake
- run: # other custom docker commands
```

## Open Questions
1. How can the post-action of `setup-docker-builder` access build results from `build-push-action` invocations?
   - Need to determine if stickydisk should be committed based on build success
   - Possible solutions:
     - Environment variables
     - File-based communication
     - GitHub Actions outputs/state

## Benefits
1. **Cleaner separation of concerns** - Setup vs build logic separated
2. **Simpler maintenance** - Each action has focused responsibility
3. **Better user experience** - One buildkitd instance regardless of build count
4. **More flexible** - Users can mix our build action with custom Docker commands

## Migration Path
1. Create new `setup-docker-builder` repository/action
2. Move buildkitd setup and stickydisk logic from current action
3. Refactor `build-push-action` to remove setup logic
4. Update documentation and examples
5. Provide migration guide for existing users