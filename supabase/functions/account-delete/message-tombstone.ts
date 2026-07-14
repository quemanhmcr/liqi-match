export function buildMessageRemovalTombstoneV1(deletedAt: string) {
  return {
    body: 'Tin nhắn đã bị xoá',
    content_kind_v1: 'system' as const,
    content_v1: { eventType: 'message_removed', kind: 'system' as const },
    deleted_at: deletedAt,
    media_asset_id_v1: null,
  };
}

export function buildMessageSenderIdentityFilterV1(
  legacyProfileId: string,
  playerId: string,
) {
  if (!legacyProfileId || !playerId) {
    throw new Error(
      'Both legacy ProfileId and canonical PlayerId are required for message tombstoning.',
    );
  }
  return `sender_id.eq.${legacyProfileId},sender_player_id_v1.eq.${playerId}`;
}
