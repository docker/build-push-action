group "default" {
  targets = ["db", "app"]
}

group "release" {
  targets = ["db", "app-plus"]
}

target "db" {
  context = "./test"
  tags = ["docker.io/tonistiigi/db"]
}

target "app" {
  context = "./test"
  dockerfile = "Dockerfile-bake"
  args = {
    name = "foo"
  }
  tags = [
    "localhost:5000/name/app:latest",
    "localhost:5000/name/app:1.0.0"
  ]
}

target "cross" {
  platforms = [
    "linux/amd64",
    "linux/arm64",
    "linux/386"
  ]
}

target "app-plus" {
  inherits = ["app", "cross"]
  args = {
    IAMPLUS = "true"
  }
}
