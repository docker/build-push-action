## Contributing

Hi there! We're thrilled that you'd like to contribute to this project. Your help is essential for keeping it great.

Contributions to this project are [released](https://docs.github.com/en/github/site-policy/github-terms-of-service#6-contributions-under-repository-license)
to the public under the [project's open source license](LICENSE).

## Submitting a pull request

1. [Fork](https://github.com/docker/build-push-action/fork) and clone the repository
2. Configure and install the dependencies: `yarn install`
3. Create a new branch: `git checkout -b my-branch-name`
4. Make your changes
5. Make sure the tests pass: `docker buildx bake test`
6. Format code and build javascript artifacts: `docker buildx bake pre-checkin`
7. Validate all code has correctly formatted and built: `docker buildx bake validate`
8. Push to your fork and [submit a pull request](https://github.com/docker/build-push-action/compare)
9. Pat your self on the back and wait for your pull request to be reviewed and merged.

Here are a few things you can do that will increase the likelihood of your pull request being accepted:

- Make sure the `README.md` and any other relevant **documentation are kept up-to-date**.
- We try to follow [SemVer v2.0.0](https://semver.org/). Randomly breaking public APIs is not an option.
- Keep your change as focused as possible. If there are multiple changes you would like to make that are not dependent upon each other, consider submitting them as **separate pull requests**.
- Write a [good commit message](http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html).

## Resources

- [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/)
- [Using Pull Requests](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-requests)
- [GitHub Help](https://docs.github.com/en)
