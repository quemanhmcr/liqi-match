import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { usePlayerIdentities } from '@/entities/player-identity';
import { useFriendshipsQuery } from '@/entities/social-relationship';
import type { PlayerId } from '@/shared/contracts/core-v1';
import { LiquidButton, LiquidCard } from '@/shared/components/liquid';

export type FriendPlayerPickerModalProps = Readonly<{
  excludedPlayerIds?: readonly string[];
  initialSelectedPlayerIds?: readonly PlayerId[];
  maxSelected?: number;
  onClose: () => void;
  onConfirm: (playerIds: readonly PlayerId[]) => void;
  purpose: 'conversation' | 'session' | 'set';
  selectedPlayerIds: readonly PlayerId[];
  setSelectedPlayerIds: (playerIds: readonly PlayerId[]) => void;
  title: string;
  visible: boolean;
}>;

export function FriendPlayerPickerModal({
  excludedPlayerIds = [],
  maxSelected = 1,
  onClose,
  onConfirm,
  purpose,
  selectedPlayerIds,
  setSelectedPlayerIds,
  title,
  visible,
}: FriendPlayerPickerModalProps) {
  const friendships = useFriendshipsQuery();
  const relationships = (friendships.data?.items ?? []).filter(
    (relationship) =>
      relationship.friendship.state === 'accepted' &&
      !excludedPlayerIds.includes(relationship.targetPlayerId) &&
      capabilityForPurpose(relationship.capabilities, purpose),
  );
  const identities = usePlayerIdentities(
    relationships.map((relationship) => relationship.targetPlayerId),
  );
  const identityById = new Map(
    (identities.data ?? []).map((identity) => [identity.playerId, identity]),
  );

  const toggle = (playerId: PlayerId) => {
    if (selectedPlayerIds.includes(playerId)) {
      setSelectedPlayerIds(selectedPlayerIds.filter((id) => id !== playerId));
      return;
    }
    if (selectedPlayerIds.length >= maxSelected) return;
    setSelectedPlayerIds([...selectedPlayerIds, playerId]);
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Đóng danh sách người chơi"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <LiquidCard
          contentStyle={styles.card}
          radius={30}
          style={styles.frame}
          surfaceBackground="rgba(11,15,31,0.98)"
          variant="purple"
        >
          <View style={styles.handle} />
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Text style={styles.subtitle}>
              Đã chọn {selectedPlayerIds.length}/{maxSelected}
            </Text>
          </View>
          <ScrollView contentContainerStyle={styles.list} style={styles.scroll}>
            {friendships.isLoading || identities.isLoading ? (
              <Text style={styles.state}>Đang tải bạn bè…</Text>
            ) : null}
            {relationships.map((relationship, index) => {
              const identity = identityById.get(relationship.targetPlayerId);
              const selected = selectedPlayerIds.includes(
                relationship.targetPlayerId,
              );
              const disabled =
                !selected && selectedPlayerIds.length >= maxSelected;
              return (
                <Pressable
                  accessibilityLabel={`${selected ? 'Bỏ chọn' : 'Chọn'} ${identity?.displayName ?? `Người chơi ${index + 1}`}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  key={relationship.targetPlayerId}
                  onPress={() => toggle(relationship.targetPlayerId)}
                  style={({ pressed }) => [
                    styles.row,
                    disabled && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.avatar}>
                    {identity?.avatarUrl ? (
                      <Image
                        source={{ uri: identity.avatarUrl }}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <Text style={styles.initial}>
                        {identity?.displayName.slice(0, 1).toUpperCase() ??
                          index + 1}
                      </Text>
                    )}
                  </View>
                  <View style={styles.copy}>
                    <Text numberOfLines={1} style={styles.name}>
                      {identity?.displayName ?? `Người chơi ${index + 1}`}
                    </Text>
                    <Text style={styles.meta}>
                      {identity?.rank?.name ??
                        identity?.primaryRole?.name ??
                        'Bạn bè trên LIQI'}
                    </Text>
                  </View>
                  <View
                    style={[styles.check, selected && styles.checkSelected]}
                  >
                    {selected ? (
                      <Ionicons color="#FFFFFF" name="checkmark" size={16} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
            {!friendships.isLoading && !relationships.length ? (
              <Text style={styles.state}>
                Chưa có bạn bè phù hợp để chọn cho thao tác này.
              </Text>
            ) : null}
          </ScrollView>
          {friendships.error || identities.error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              Chưa thể tải danh sách bạn bè. Hãy thử lại.
            </Text>
          ) : null}
          <View style={styles.actions}>
            <LiquidButton onPress={onClose} variant="ghost">
              Huỷ
            </LiquidButton>
            <LiquidButton
              disabled={!selectedPlayerIds.length}
              onPress={() => onConfirm(selectedPlayerIds)}
            >
              Xác nhận
            </LiquidButton>
          </View>
        </LiquidCard>
      </View>
    </Modal>
  );
}

function capabilityForPurpose(
  capabilities: { canInviteToSession: boolean; canMessage: boolean },
  purpose: FriendPlayerPickerModalProps['purpose'],
) {
  if (purpose === 'conversation') return capabilities.canMessage;
  return capabilities.canInviteToSession;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(130,91,220,0.17)',
    borderRadius: 19,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  avatarImage: { height: '100%', width: '100%' },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(2,4,12,0.74)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 14,
  },
  card: { gap: 14, maxHeight: '82%', padding: 17 },
  check: {
    alignItems: 'center',
    borderColor: 'rgba(206,192,246,0.24)',
    borderRadius: 12,
    borderWidth: 1,
    height: 25,
    justifyContent: 'center',
    width: 25,
  },
  checkSelected: { backgroundColor: '#7758D8', borderColor: '#BBA6FF' },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  disabled: { opacity: 0.42 },
  error: { color: '#FFB9C5', fontSize: 12, textAlign: 'center' },
  frame: { maxWidth: 540, width: '100%' },
  handle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(225,216,255,0.24)',
    borderRadius: 999,
    height: 4,
    width: 42,
  },
  heading: { gap: 4 },
  initial: { color: '#E3D7FF', fontSize: 13, fontWeight: '800' },
  list: { gap: 2 },
  meta: { color: 'rgba(207,217,241,0.54)', fontSize: 10.5 },
  name: { color: '#F7F4FF', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  row: {
    alignItems: 'center',
    borderBottomColor: 'rgba(211,221,246,0.07)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 11,
    minHeight: 64,
    paddingVertical: 7,
  },
  scroll: { maxHeight: 420 },
  state: {
    color: 'rgba(213,221,244,0.60)',
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 20,
    textAlign: 'center',
  },
  subtitle: { color: 'rgba(208,217,242,0.58)', fontSize: 11.5 },
  title: { color: '#FAF8FF', fontSize: 19, fontWeight: '800' },
});
