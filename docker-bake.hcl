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
  dockerfile = "dev.Dockerfile"
  target = "build-update"
  output = ["."]
}

target "build-validate" {
  dockerfile = "dev.Dockerfile"
  target = "build-validate"
  output = ["type=cacheonly"]
}

target "format" {
  dockerfile = "dev.Dockerfile"
  target = "format-update"
  output = ["."]
}

target "lint" {
  dockerfile = "dev.Dockerfile"
  target = "lint"
  output = ["type=cacheonly"]
}

target "vendor" {
  dockerfile = "dev.Dockerfile"
  target = "vendor-update"
  output = ["."]
}

target "vendor-validate" {
  dockerfile = "dev.Dockerfile"
  target = "vendor-validate"
  output = ["type=cacheonly"]
}

target "test" {
  dockerfile = "dev.Dockerfile"
  target = "test-coverage"
  output = ["./coverage"]
}
