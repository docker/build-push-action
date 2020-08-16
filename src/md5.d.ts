declare module 'md5' {
  function md5(data: string, options?: {encoding: string; asBytes: boolean; asString: boolean}): string;
  export = md5;
}
