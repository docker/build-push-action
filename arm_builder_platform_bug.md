# Incorrect `--platform` flag when creating remote Buildx builder

## What is the bug?
When the action spins up a **remote** Buildx builder it always adds the option

```bash
docker buildx create … --platform linux/amd64 …
```

regardless of the `platforms:` input provided by the user or the
architecture of the runner that is executing the job.  In the log excerpt
observed from customers the runner is `linux/arm64`, the user requested
`platforms: linux/arm64`, yet the builder is created with
`--platform linux/amd64`.

## Why does this happen?
The helper that assembles the arguments for `docker buildx create` (see
`context.getRemoteBuilderArgs`) hard-codes `--platform linux/amd64` instead
of propagating the caller-supplied platforms list or detecting the host
architecture.  Because this code path is executed every time a remote
builder is requested, every customer who uses the remote driver is affected.

## How does it affect customers?
* The builder advertises only the amd64 platform even on arm64 runners.
* Buildx may silently fall back to QEMU emulation inside the builder,
  slowing builds and producing confusing CPU usage patterns.
* Cache keys are generated per platform; advertising the wrong platform can
  reduce cache hits or create duplicate caches that waste storage.
* Logs show a mismatch between the declared build target (`linux/arm64`) and
  the builder's reported platform (`linux/amd64`), which is a common source
  of support tickets and undermines trust in the tool.

Most jobs still succeed because Buildx can emulate the foreign architecture,
so customers rarely see hard failures.  They do, however, experience longer
build times and uncertainty about what is really happening.

## Proposed fix
1. **Propagate user intent** – Use the `platforms` input when constructing
   `docker buildx create` arguments:

   ```ts
   // pseudo-code
   const platformsArg = inputs.platforms.join(',');
   if (platformsArg) args.push('--platform', platformsArg);
   ```

2. **Fallback to host arch** – If the user does not supply `platforms`,
   derive the native architecture from `process.arch` or
   `docker info --format '{{.Architecture}}'` and pass that instead.

3. **Remove the flag** – Alternatively, omit `--platform` entirely and let
   Buildx detect the platform list from connected BuildKit workers.

## Benefits of fixing it
* **Accurate builder metadata** – `buildx inspect` will reflect the actual
  worker platforms, eliminating confusion in logs and support tickets.
* **Performance gains** – Native arm64 workers will build arm64 images
  without QEMU emulation, reducing build times significantly (often 2-3×).
* **Higher cache efficiency** – Cache entries will be generated for the
  correct platform, improving reuse across builds and cutting storage
  costs.
* **Foundation for multi-platform builds** – Correct handling of the
  `platforms` flag is prerequisite for future work on native multi-platform
  clusters.

---
*Prepared by: build-push-action investigation* 