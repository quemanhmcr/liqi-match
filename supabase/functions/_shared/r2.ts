type PresignPutInput = {
  objectKey: string;
  contentType: string;
  byteSize: number;
  checksum?: string;
  expiresInSeconds: number;
};

type PresignReadInput = {
  method: 'HEAD' | 'GET';
  objectKey: string;
  expiresInSeconds: number;
};

const textEncoder = new TextEncoder();

function env(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function encodePathSegment(value: string): string {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function hmac(key: ArrayBuffer | Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(value));
}

async function sha256(value: string): Promise<string> {
  return toHex(
    await crypto.subtle.digest('SHA-256', textEncoder.encode(value)),
  );
}

async function signingKey(secret: string, date: string) {
  const kDate = await hmac(textEncoder.encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, 'auto');
  const kService = await hmac(kRegion, 's3');

  return hmac(kService, 'aws4_request');
}

async function presignR2Read(input: PresignReadInput) {
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const now = new Date();
  const dateStamp = amzDate(now).slice(0, 8);
  const requestDate = amzDate(now);
  const objectUrl = r2ObjectUrl(input.objectKey);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaders = 'host';
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': requestDate,
    'X-Amz-Expires': String(input.expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  const canonicalRequest = [
    input.method,
    objectUrl.pathname,
    query.toString(),
    `host:${objectUrl.host}`,
    '',
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    requestDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');
  const key = await signingKey(secretAccessKey, dateStamp);
  const signature = toHex(await hmac(key, stringToSign));

  query.set('X-Amz-Signature', signature);
  objectUrl.search = query.toString();

  return objectUrl;
}

function amzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export function r2ObjectUrl(objectKey: string): URL {
  const accountId = env('CLOUDFLARE_ACCOUNT_ID');
  const bucketName = env('R2_BUCKET_NAME');

  return new URL(
    `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodePathSegment(
      objectKey,
    )}`,
  );
}

export async function presignR2Put(input: PresignPutInput) {
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const now = new Date();
  const dateStamp = amzDate(now).slice(0, 8);
  const requestDate = amzDate(now);
  const objectUrl = r2ObjectUrl(input.objectKey);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaderNames = [
    'content-type',
    'host',
    'if-none-match',
    ...(input.checksum ? ['x-amz-checksum-sha256'] : []),
  ];
  const signedHeaders = signedHeaderNames.join(';');
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': requestDate,
    'X-Amz-Expires': String(input.expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  const canonicalHeaders = [
    `content-type:${input.contentType}`,
    `host:${objectUrl.host}`,
    'if-none-match:*',
    ...(input.checksum ? [`x-amz-checksum-sha256:${input.checksum}`] : []),
  ].join('\n');
  const canonicalRequest = [
    'PUT',
    objectUrl.pathname,
    query.toString(),
    canonicalHeaders,
    '',
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    requestDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');
  const key = await signingKey(secretAccessKey, dateStamp);
  const signature = toHex(await hmac(key, stringToSign));

  query.set('X-Amz-Signature', signature);
  objectUrl.search = query.toString();

  return {
    url: objectUrl.toString(),
    headers: {
      'content-type': input.contentType,
      'if-none-match': '*',
      ...(input.checksum ? { 'x-amz-checksum-sha256': input.checksum } : {}),
    },
    expiresAt: new Date(
      now.getTime() + input.expiresInSeconds * 1000,
    ).toISOString(),
  };
}

export async function headR2Object(objectKey: string) {
  const url = await presignR2Read({
    method: 'HEAD',
    objectKey,
    expiresInSeconds: 60,
  });
  const response = await fetch(url, { method: 'HEAD' });

  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    byteSize: Number(response.headers.get('content-length') ?? 0),
    etag: response.headers.get('etag'),
  };
}
