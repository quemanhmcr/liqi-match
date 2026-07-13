import type { ImageSourcePropType } from 'react-native';

import type { NotificationActor } from '@/entities/notifications';
import { resolveGoldenWorldAssetSource } from '@/entities/media-asset';

export const notificationFilters = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'set-invite', label: 'Mời set' },
  { id: 'system', label: 'Hệ thống' },
  { id: 'interaction', label: 'Tương tác' },
] as const;

export type NotificationFilterId = (typeof notificationFilters)[number]['id'];

export function notificationActorImageSource(
  actor: NotificationActor,
): ImageSourcePropType | undefined {
  if (actor.avatarUrl) return { uri: actor.avatarUrl };
  return actor.avatarAssetKey
    ? (resolveGoldenWorldAssetSource(actor.avatarAssetKey) as
        ImageSourcePropType | undefined)
    : undefined;
}
