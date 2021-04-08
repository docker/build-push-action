import {ImageReference} from '../src/image-reference';

describe('fromString', () => {
  // prettier-ignore
  test.each([
    [
      'foo_com',
      {
        path: 'foo_com'
      },
      false
    ],
    [
      'foo.com:tag',
      {
        path: 'foo.com',
        tag: 'tag'
      },
      false
    ],
    [
      'foo.com:5000',
      {
        path: 'foo.com',
        tag: '5000'
      },
      false
    ],
    [
      'foo.com/repo:tag',
      {
        domain: 'foo.com',
        path: 'repo',
        tag: 'tag'
      },
      false
    ],
    [
      'foo.com:5000/repo',
      {
        domain: 'foo.com:5000',
        path: 'repo'
      },
      false
    ],
    [
      'foo.com:5000/repo:tag',
      {
        domain: 'foo.com:5000',
        path: 'repo',
        tag: 'tag'
      },
      false
    ],
    [
      'foo:5000/repo@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      {
        domain: 'foo:5000',
        path: 'repo',
        digest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      },
      false
    ],
    [
      'foo:5000/repo:tag@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      {
        domain: 'foo:5000',
        path: 'repo',
        tag: 'tag',
        digest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      },
      false
    ],
    [
      'foo:5000/repo',
      {
        domain: 'foo:5000',
        path: 'repo'
      },
      false
    ],
    [
      ':justtag',
      {},
      true
    ],
    [
      'b.gcr.io/foo.example.com/my-app:foo.example.com',
      {
        domain: 'b.gcr.io',
        path: 'foo.example.com/my-app',
        tag: 'foo.example.com',
      },
      false
    ],
    [
      'docker.io/library/ubuntu:18.04@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      {
        domain: 'docker.io',
        path: 'library/ubuntu',
        tag: '18.04',
        digest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      },
      false
    ],
    [
      'ghactionstest/ghactionstest',
      {
        domain: 'ghactionstest',
        path: 'ghactionstest'
      },
      false
    ],
    [
      'ghcr.io/docker-ghactiontest/test',
      {
        domain: 'ghcr.io',
        path: 'docker-ghactiontest/test'
      },
      false
    ],
    [
      'registry.gitlab.com/test1716/test',
      {
        domain: 'registry.gitlab.com',
        path: 'test1716/test'
      },
      false
    ],
    [
      '175142243308.dkr.ecr.us-east-2.amazonaws.com/sandbox/test-docker-action',
      {
        domain: '175142243308.dkr.ecr.us-east-2.amazonaws.com',
        path: 'sandbox/test-docker-action'
      },
      false
    ],
    [
      'public.ecr.aws/q3b5f1u4/test-docker-action',
      {
        domain: 'public.ecr.aws',
        path: 'q3b5f1u4/test-docker-action'
      },
      false
    ],
    [
      'us-east4-docker.pkg.dev/sandbox-298914/docker-official-github-actions/test-docker-action',
      {
        domain: 'us-east4-docker.pkg.dev',
        path: 'sandbox-298914/docker-official-github-actions/test-docker-action'
      },
      false
    ],
    [
      'gcr.io/sandbox-298914/test-docker-action',
      {
        domain: 'gcr.io',
        path: 'sandbox-298914/test-docker-action'
      },
      false
    ],
    [
      'ghcr.io/KTH-Library/kontarion:latest',
      {
        domain: 'ghcr.io',
        path: 'kth-library/kontarion',
        tag: 'latest'
      },
      false
    ],
  ])(
    'given %p',
    async (input, expected, invalid) => {
      try {
        const ir = ImageReference.fromString(input);
        console.log(ir);
        expect(ir).toEqual(expected);
      } catch (err) {
        if (!invalid) {
          console.error(err);
        }
        expect(true).toBe(invalid);
      }
    }
  );
});
