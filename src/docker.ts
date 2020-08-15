export interface Image {
  registry?: string;
  namespace?: string;
  repository: string;
  tag?: string;
}

export const parseImage = async (image: string): Promise<Image | undefined> => {
  const match = image.match(/^(?:([^\/]+)\/)?(?:([^\/]+)\/)?([^@:\/]+)(?:[@:](.+))?$/);
  if (!match) {
    return;
  }

  let res: Image = {
    registry: match[1],
    namespace: match[2],
    repository: match[3],
    tag: match[4]
  };

  if (!res.namespace && res.registry && !/[:.]/.test(res.registry)) {
    res.namespace = res.registry;
    res.registry = undefined;
  }

  res.registry = res.registry ? `${res.registry}/` : '';
  res.namespace = res.namespace && res.namespace !== 'library' ? `${res.namespace}/` : '';
  res.tag = res.tag && res.tag !== 'latest' ? `:${res.tag}` : '';
  return res;
};
