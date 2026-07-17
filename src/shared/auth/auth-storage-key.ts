export const LEGACY_AUTH_STORAGE_KEY = 'liqi-match.auth.session.v1';

export function createAuthStorageKey(
  supabaseUrl: string,
  projectScoped: boolean,
): string {
  if (!projectScoped) return LEGACY_AUTH_STORAGE_KEY;

  const hostname = new URL(supabaseUrl).hostname.toLowerCase();
  const projectScope = hostname.endsWith('.supabase.co')
    ? hostname.slice(0, -'.supabase.co'.length)
    : hostname;
  const safeScope = projectScope.replace(/[^a-z0-9._-]/g, '_');
  if (!safeScope)
    throw new Error('Supabase project scope could not be resolved.');
  return `${LEGACY_AUTH_STORAGE_KEY}.${safeScope}`;
}
