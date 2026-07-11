import type { IdentityVerifier } from '../../application/ports';
import type { WorkerEnv } from '../../platform/env';

type JwtPayload = { sub: string; exp: number; aud?: string | string[] };
type Jwks = { keys: Array<JsonWebKey & { kid?: string }> };

export class SupabaseJwtVerifier implements IdentityVerifier {
  constructor(private readonly env: WorkerEnv) {}

  async verify(token: string) {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error('Invalid JWT format');
    }
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as {
      alg: string;
      kid?: string;
    };
    if (header.alg !== 'RS256' && header.alg !== 'ES256') {
      throw new Error('Unsupported JWT algorithm');
    }

    const jwksResponse = await fetch(this.env.SUPABASE_JWT_JWKS_URL, {
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!jwksResponse.ok) throw new Error('JWKS lookup failed');
    const jwks = (await jwksResponse.json()) as Jwks;
    const jwk = jwks.keys.find((key) => key.kid === header.kid);
    if (!jwk) throw new Error('JWT key not found');

    const algorithm =
      header.alg === 'RS256'
        ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
        : { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
    const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, [
      'verify',
    ]);
    const valid = await crypto.subtle.verify(
      algorithm,
      key,
      base64UrlToBytes(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!valid) throw new Error('Invalid JWT signature');

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
    if (!payload.sub || payload.exp * 1000 < Date.now()) {
      throw new Error(payload.sub ? 'JWT expired' : 'JWT subject missing');
    }
    return { userId: payload.sub };
  }
}

function base64UrlDecode(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function base64UrlToBytes(value: string) {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
