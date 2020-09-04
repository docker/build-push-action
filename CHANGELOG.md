# Changelog

## 2.0.0 (2020/??/??)

v2 of Build Push action uses Docker [Buildx](https://github.com/docker/buildx). It's also rewritten as
a [typescript-action](https://github.com/actions/typescript-action/) to be as closed as possible of
the [GitHub Runner](https://github.com/actions/virtual-environments) during its execution (#71 #92).

* Rename `path` input to `context`
* Rename `dockerfile` input to `file`
* Rename `always_pull` input to `pull`
* Add `builder` input to be able to choose a builder instance through our [setup-buildx action](https://github.com/docker/setup-buildx-action)
* Add [`platforms`](https://github.com/docker/buildx#---platformvaluevalue) input
* Add [`allow`](https://github.com/docker/buildx#--allowentitlement) input
* Add [`load`](https://github.com/docker/buildx#--load) input
* Add [`outputs`](https://github.com/docker/buildx#-o---outputpath-typetypekeyvalue) input
* Add [`cache-from`](https://github.com/docker/buildx#--cache-fromnametypetypekeyvalue) input
* Add [`cache-to`](https://github.com/docker/buildx#--cache-tonametypetypekeyvalue) input
* Add `secrets` input
* Review `tags` input
* Remove `repository`, `username`, `password`, `registry`, `cache_froms` inputs
* Remove `tag_with_sha`, `tag_with_ref`, `add_git_labels` inputs
* Handle Git context
* Add `digest` output
* Login support moved to [docker/login-action](https://github.com/docker/login-action) repo
* Enhanced examples in README
* Tests and/or CI workflows

## 1.1.0 (2020/04/23)

* Add cache-from support fixing #7
* Add GCR example

## 1.0.1 (2020/03/23)

* Clarify dockerfile and path inputs
* Rename LICENCE to LICENSE
* Use v1 of docker/gihub-actions image
* Logs in before building image

## 1.0.0 (2020/03/18)

* Build and push Docker images to Docker Hub or your own private registry.
* Log in to Hub or private registry.
* Static tags and labels.
* Auto tagging by git ref.
* Auto tagging by git SHA.
* Auto labelling with opencontainers standards.
* Build arguments.
* Multi-stage build targets.

Backed by Docker image [docker/github-action:v1.0](https://hub.docker.com/repository/docker/docker/github-actions/)
