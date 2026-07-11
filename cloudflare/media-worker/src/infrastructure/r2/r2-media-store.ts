import type { MediaObjectStore } from '../../application/ports';

export class R2MediaObjectStore implements MediaObjectStore {
  constructor(private readonly bucket: R2Bucket) {}

  delete(objectKey: string) {
    return this.bucket.delete(objectKey);
  }

  get(objectKey: string, options?: R2GetOptions) {
    return this.bucket.get(objectKey, options);
  }
}
