// Grammar
//
//  reference                       := name [ ":" tag ] [ "@" digest ]
//  name                            := [domain '/'] path-component ['/' path-component]*
//  domain                          := domain-component ['.' domain-component]* [':' port-number]
//  domain-component                := /([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])/
//  port-number                     := /[0-9]+/
//  path-component                  := alpha-numeric [separator alpha-numeric]*
//  alpha-numeric                   := /[a-z0-9]+/
//  separator                       := /[_.]|__|[-]*/
//
//  tag                             := /[\w][\w.-]{0,127}/
//
//  digest                          := digest-algorithm ":" digest-hex
//  digest-algorithm                := digest-algorithm-component [ digest-algorithm-separator digest-algorithm-component ]*
//  digest-algorithm-separator      := /[+.-_]/
//  digest-algorithm-component      := /[A-Za-z][A-Za-z0-9]*/
//  digest-hex                      := /[0-9a-fA-F]{32,}/ ; At least 128 bit digest value
//
//  identifier                      := /[a-f0-9]{64}/
//  short-identifier                := /[a-f0-9]{6,64}/
//
// Ref: https://github.com/distribution/distribution/blob/master/reference/reference.go
// Ref: https://github.com/distribution/distribution/blob/master/reference/regexp.go
// Ref: https://github.com/moby/moby/blob/master/image/spec/v1.2.md
// Ref: https://github.com/jkcfg/kubernetes/blob/master/src/image-reference.ts

// nameMaxLength is the maximum total number of characters in a repository name.
const nameMaxLength = 255;

function match(s: string | RegExp): RegExp {
  if (s instanceof RegExp) {
    return s;
  }
  return new RegExp(s);
}

function quoteMeta(s: string): string {
  return s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// literal compiles s into a literal regular expression, escaping any regexp
// reserved characters.
function literal(s: string): RegExp {
  return match(quoteMeta(s));
}

// expression defines a full expression, where each regular expression must
// follow the previous.
function expression(...res: RegExp[]): RegExp {
  let s = '';
  for (const re of res) {
    s += re.source;
  }
  return match(s);
}

// optional wraps the expression in a non-capturing group and makes the
// production optional.
function optional(...res: RegExp[]): RegExp {
  return match(group(expression(...res)).source + '?');
}

// repeated wraps the regexp in a non-capturing group to get one or more
// matches.
function repeated(...res: RegExp[]): RegExp {
  return match(group(expression(...res)).source + '+');
}

// capture wraps the expression in a capturing group.
function capture(...res: RegExp[]): RegExp {
  return match(`(` + expression(...res).source + `)`);
}

// anchored anchors the regular expression by adding start and end delimiters.
function anchored(...res: RegExp[]): RegExp {
  return match(`^` + expression(...res).source + `$`);
}

// group wraps the regexp in a non-capturing group.
function group(...res: RegExp[]): RegExp {
  return match(`(?:${expression(...res).source})`);
}

// alphaNumericRegexp defines the alpha numeric atom, typically a component of
// names. Can contain upper case characters compared to the default API to
// fix https://github.com/docker/build-push-action/issues/237#issue-748654527
const alphaNumericRegexp = match(/[a-zA-Z0-9]+/);

// separatorRegexp defines the separators allowed to be embedded in name components.
// This allow one period, one or two underscore and multiple dashes.
const separatorRegexp = match(/(?:[._]|__|[-]*)/);

// nameComponentRegexp restricts registry path component names to start with at
// least one letter or number, with following parts able to be separated by one
// period, one or two underscore and multiple dashes.
const nameComponentRegexp = expression(alphaNumericRegexp, optional(repeated(separatorRegexp, alphaNumericRegexp)));

// domainComponentRegexp restricts the registry domain component of a
// repository name to start with a component as defined by DomainRegexp
// and followed by an optional port.
const domainComponentRegexp = match(/(?:[a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])/);

// DomainRegexp defines the structure of potential domain components
// that may be part of image names. This is purposely a subset of what is
// allowed by DNS to ensure backwards compatibility with Docker image
// names.
const DomainRegexp = expression(
  domainComponentRegexp,
  optional(repeated(literal(`.`), domainComponentRegexp)),
  optional(literal(`:`), match(/[0-9]+/))
);

// TagRegexp matches valid tag names. From docker/docker:graph/tags.go.
const TagRegexp = match(/[\w][\w.-]{0,127}/);

// anchoredTagRegexp matches valid tag names, anchored at the start and
// end of the matched string.
const anchoredTagRegexp = anchored(TagRegexp);

// DigestRegexp matches valid digests.
const DigestRegexp = match(/[A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*[:][0-9a-fA-F]{32,}/);

// anchoredDigestRegexp matches valid digests, anchored at the start and
// end of the matched string.
const anchoredDigestRegexp = anchored(DigestRegexp);

// NameRegexp is the format for the name component of references. The
// regexp has capturing groups for the domain and name part omitting
// the separating forward slash from either.
const NameRegexp = expression(
  optional(DomainRegexp, literal(`/`)),
  nameComponentRegexp,
  optional(repeated(literal(`/`), nameComponentRegexp))
);

// anchoredNameRegexp is used to parse a name value, capturing the
// domain and trailing components.
const anchoredNameRegexp = anchored(
  optional(capture(DomainRegexp), literal(`/`)),
  capture(nameComponentRegexp, optional(repeated(literal(`/`), nameComponentRegexp)))
);

// ReferenceRegexp is the full supported format of a reference. The regexp
// is anchored and has capturing groups for name, tag, and digest
// components.
const ReferenceRegexp = anchored(
  capture(NameRegexp),
  optional(literal(':'), capture(TagRegexp)),
  optional(literal('@'), capture(DigestRegexp))
);

// IdentifierRegexp is the format for string identifier used as a
// content addressable identifier using sha256. These identifiers
// are like digests without the algorithm, since sha256 is used.
const IdentifierRegexp = match(/([a-f0-9]{64})/);

// ShortIdentifierRegexp is the format used to represent a prefix
// of an identifier. A prefix may be used to match a sha256 identifier
// within a list of trusted identifiers.
const ShortIdentifierRegexp = match(/([a-f0-9]{6,64})/);

// anchoredIdentifierRegexp is used to check or match an
// identifier value, anchored at start and end of string.
const anchoredIdentifierRegexp = anchored(IdentifierRegexp);

// anchoredShortIdentifierRegexp is used to check if a value
// is a possible identifier prefix, anchored at start and end
// of string.
const anchoredShortIdentifierRegexp = anchored(ShortIdentifierRegexp);

interface VersionInfo {
  tag?: string;
  digest?: string;
}

export class ImageReference {
  domain?: string;
  path: string;
  tag?: string;
  digest?: string;

  constructor(domain: string | undefined, path: string, version?: VersionInfo) {
    this.domain = domain?.toLowerCase();
    this.path = path?.toLowerCase();
    if (version) {
      this.tag = version.tag;
      this.digest = version.digest;
    }
  }

  get image(): string {
    const components = this.path.split('/');
    return components[components.length - 1];
  }

  toString(): string {
    let s = '';
    if (this.domain) {
      s += this.domain + '/';
    }
    s += this.path;
    if (this.tag) {
      s += ':' + this.tag;
    }
    if (this.digest) {
      s += '@' + this.digest;
    }
    return s;
  }

  static fromString(s: string): ImageReference {
    const matches = s.match(ReferenceRegexp);
    if (matches == null) {
      throw new Error(`invalid image reference`);
    }

    const name = matches[1],
      tag = matches[2],
      digest = matches[3];
    if (name.length > nameMaxLength) {
      throw new Error(`repository name must not be more than ${nameMaxLength} characters`);
    }

    const nameMatches = name.match(anchoredNameRegexp);
    if (nameMatches == null) {
      throw new Error(`invalid image reference`);
    }

    const domain = nameMatches[1],
      path = nameMatches[2];
    return new ImageReference(domain, path, {tag, digest});
  }

  static sanitize(s: string): string {
    return this.fromString(s).toString();
  }
}
