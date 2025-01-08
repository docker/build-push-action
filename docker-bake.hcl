target "_common" {
  args = {
    BUILDKIT_CONTEXT_KEEP_GIT_DIR = 1
  }
}

group "default" {
  targets = ["build"]
}

group "pre-checkin" {
  targets = ["vendor", "format", "build"]
}

group "validate" {
  targets = ["lint", "build-validate", "vendor-validate"]
}

target "build" {
  inherits = ["_common"]
  dockerfile = "dev.Dockerfile"
  target = "build-update"
  output = ["."]
}

target "build-validate" {
  inherits = ["_common"]
  dockerfile = "dev.Dockerfile"
  target = "build-validate"
  output = ["type=cacheonly"]
}

target "format" {
  inherits = ["_common"]
  dockerfile = "dev.Dockerfile"
  target = "format-update"
  output = ["."]
}

target "lint" {
  inherits = ["_common"]
  dockerfile = "dev.Dockerfile"
  target = "lint"
  output = ["type=cacheonly"]
}

target "vendor" {
  inherits = ["_common"]
  dockerfile = "dev.Dockerfile"
  target = "vendor-update"
  output = ["."]
}

target "vendor-validate" {
  inherits = ["_common"]
  dockerfile = "dev.Dockerfile"
  target = "vendor-validate"
  output = ["type=cacheonly"]
}

target "test" {
  inherits = ["_common"]
  dockerfile = "dev.Dockerfile"
  target = "test-coverage"
  output = ["./coverage"]
}
