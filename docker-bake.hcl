variable "NODE_VERSION" {
  default = "12"
}

target "node-version" {
  args = {
    NODE_VERSION = NODE_VERSION
  }
}

group "default" {
  targets = ["build"]
}

group "pre-checkin" {
  targets = ["vendor-update", "format", "build"]
}

group "validate" {
  targets = ["format-validate", "build-validate", "vendor-validate"]
}

target "build" {
  inherits = ["node-version"]
  dockerfile = "./hack/build.Dockerfile"
  target = "build-update"
  output = ["."]
}

target "build-validate" {
  inherits = ["node-version"]
  dockerfile = "./hack/build.Dockerfile"
  target = "build-validate"
  output = ["type=cacheonly"]
}

target "format" {
  inherits = ["node-version"]
  dockerfile = "./hack/build.Dockerfile"
  target = "format-update"
  output = ["."]
}

target "format-validate" {
  inherits = ["node-version"]
  dockerfile = "./hack/build.Dockerfile"
  target = "format-validate"
  output = ["type=cacheonly"]
}

target "vendor-update" {
  inherits = ["node-version"]
  dockerfile = "./hack/build.Dockerfile"
  target = "vendor-update"
  output = ["."]
}

target "vendor-validate" {
  inherits = ["node-version"]
  dockerfile = "./hack/build.Dockerfile"
  target = "vendor-validate"
  output = ["type=cacheonly"]
}

target "test" {
  inherits = ["node-version"]
  dockerfile = "./hack/build.Dockerfile"
  target = "test-coverage"
  output = ["./coverage"]
}
