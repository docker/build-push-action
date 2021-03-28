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
}

target "vendor-update" {
  inherits = ["node-version"]
  dockerfile = "./hack/vendor.Dockerfile"
  target = "update"
  output = ["."]
}

target "vendor-validate" {
  inherits = ["node-version"]
  dockerfile = "./hack/vendor.Dockerfile"
  target = "validate"
}

target "test" {
  inherits = ["node-version"]
  dockerfile = "./hack/test.Dockerfile"
  target = "test-coverage"
  output = ["./coverage"]
}
