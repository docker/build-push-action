# Troubleshooting

* [Cannot push to a registry](#cannot-push-to-a-registry)
* [`repository name must be lowercase`](#repository-name-must-be-lowercase)

## Cannot push to a registry

While pushing to a registry, you may encounter these kinds of issues:

* `failed commit on ref "layer-sha256:...": invalid content digest in response: invalid checksum digest format`
* `failed commit on ref "layer-sha256:...": no response`
* `failed commit on ref "manifest-sha256:...": unexpected status: 400 Bad Request`
* `failed commit on ref "manifest-sha256:...": unexpected status: 401 Unauthorized`
* `unexpected response: 401 Unauthorized`

These issues are not directly related to this action but are rather linked to
[Buildx](https://github.com/docker/buildx), [BuildKit](https://github.com/moby/buildkit),
[containerd](https://github.com/containerd/containerd) or the registry on which
you're pushing your image. The quality of error message depends on the registry
and are usually not very informative.

To help you solve this, you have to [enable debugging in the setup-buildx](https://github.com/docker/setup-buildx-action#buildkit-container-logs)
action step and attach BuildKit container logs to your issue.

## `repository name must be lowercase`

You may encounter this issue if you're using `github.repository` as a repo slug
in your tag:

```
#6 exporting to image
#6 exporting layers
#6 exporting layers 1.2s done
#6 exporting manifest sha256:b47f7dfb97b89ccd5de553af3c8cd94c4795884cbe5693e93946b1d95a7b1d12 0.0s done
#6 exporting config sha256:995e93fab8196893192f08a38deea6769dc4d98f86cf705eccc24ec96a3e271c 0.0s done
#6 ERROR: invalid reference format: repository name must be lowercase
------
 > exporting to image:
------
error: failed to solve: invalid reference format: repository name must be lowercase
```

or a cache reference:

```
#10 importing cache manifest from ghcr.io/My-Org/repo:main
#10 ERROR: invalid reference format: repository name must be lowercase
```

To fix this issue you can use our [metadata action](https://github.com/docker/metadata-action)
to generate sanitized tags:

```yaml
- name: Docker meta
  id: meta
  uses: docker/metadata-action@v6
  with:
    images: ghcr.io/${{ github.repository }}
    tags: latest

- name: Build and push
  uses: docker/build-push-action@v7
  with:
    push: true
    tags: ${{ steps.meta.outputs.tags }}
```

Or a dedicated step to sanitize the slug:

```yaml
- name: Sanitize repo slug
  uses: actions/github-script@v8
  id: repo_slug
  with:
    result-encoding: string
    script: return 'ghcr.io/${{ github.repository }}'.toLowerCase()

- name: Build and push
  uses: docker/build-push-action@v7
  with:
    push: true
    tags: ${{ steps.repo_slug.outputs.result }}:latest
```
