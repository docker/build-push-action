group "default" {
  targets = ["build"]
}

group "pre-checkin" {
  targets = ["update-yarn", "format", "build"]
}

group "validate" {
	targets = ["validate-format", "validate-build", "validate-yarn"]
}

target "update-yarn" {
  target = "update-yarn"
  output = ["."]
}

target "build" {
  target = "dist"
  output = ["."]
}

target "test" {
  target = "test"
}

target "format" {
  target = "format"
  output = ["."]
}

target "validate-format" {
  target = "validate-format"
}

target "validate-build" {
  target = "validate-build"
}

target "validate-yarn" {
	target = "validate-yarn"
}
