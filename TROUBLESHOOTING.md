# Troubleshooting

## Errors on pushing to registry

While pushing to a registry, you may encounter these kinds of issues:

* `failed commit on ref "layer-sha256:...": invalid content digest in response: invalid checksum digest format`
* `failed commit on ref "layer-sha256:...": no response`
* `failed commit on ref "manifest-sha256:...": unexpected status: 401 Unauthorized`
* `unexpected response: 401 Unauthorized`

These issues are not directly related to this action but are rather linked to [buildx](https://github.com/docker/buildx),
[buildkit](https://github.com/moby/buildkit), [containerd](https://github.com/containerd/containerd) or the registry
on which you're pushing your image. The quality of error message depends on the registry and are usually not very informative.

To help you solve this, you should first enable debugging in the
[setup-buildx action step](https://github.com/docker/setup-buildx-action):

```yaml
  -
    name: Set up Docker Buildx
    uses: docker/setup-buildx-action@v1
    with:
      buildkitd-flags: --debug
```

Next you can test pushing with containerd using [this workflow](https://github.com/crazy-max/ghaction-setup-containerd#build-and-push-docker-image).
Do not forget to set `ctr --debug` for the pushing step. If it works then open an issue on
[buildkit](https://github.com/moby/buildkit) repository.
