/** Pure media constraints shared by upload use cases. */
export const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const maxBytesByPurpose = {
  game_profile: 8 * 1024 * 1024,
  personal_avatar: 5 * 1024 * 1024,
  chat_attachment: 12 * 1024 * 1024,
  report_evidence: 20 * 1024 * 1024,
} as const;

export const visibilityByPurpose = {
  game_profile: 'public',
  personal_avatar: 'public',
  chat_attachment: 'conversation_members',
  report_evidence: 'moderators_only',
} as const;

export type MediaPurpose = keyof typeof maxBytesByPurpose;

export function isMediaPurpose(value: string): value is MediaPurpose {
  return value in maxBytesByPurpose;
}

export function createObjectKey(input: {
  ownerId: string;
  purpose: MediaPurpose;
  extension: string;
}) {
  const random = crypto.randomUUID().replaceAll('-', '');
  const extension = input.extension.replace(/[^a-z0-9]/gi, '').toLowerCase();

  return `${input.purpose}/${input.ownerId}/${new Date().toISOString().slice(0, 10)}/${random}.${extension}`;
}

export function extensionForMime(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';

  return 'bin';
}
