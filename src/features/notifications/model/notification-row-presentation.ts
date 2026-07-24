export type NotificationRowKind = 'standard' | 'rich';

type NotificationRowPresentationInput = Readonly<{
  previewAvatars?: readonly unknown[];
  reward?: unknown;
}>;

/** Rich treatment is reserved for data-backed multi-actor or reward content. */
export function resolveNotificationRowKind(
  item: NotificationRowPresentationInput,
): NotificationRowKind {
  return item.previewAvatars?.length || item.reward ? 'rich' : 'standard';
}
