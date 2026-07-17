import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { LiquidCard } from '@/shared/components/liquid';

import type {
  MessageConversationSource,
  MessageParticipant,
} from '../contracts/messages-contracts';

type OptionRowProps = Readonly<{
  destructive?: boolean;
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  subtitle: string;
}>;

export type ConversationOptionsModalProps = Readonly<{
  canMute: boolean;
  canReport: boolean;
  isMuted: boolean;
  muting: boolean;
  onClose: () => void;
  onReport: () => void;
  onToggleMute: () => void;
  onViewProfile: () => void;
  onViewSource: () => void;
  peer?: MessageParticipant;
  source?: MessageConversationSource;
  visible: boolean;
}>;

export function ConversationOptionsModal({
  canMute,
  canReport,
  isMuted,
  muting,
  onClose,
  onReport,
  onToggleMute,
  onViewProfile,
  onViewSource,
  peer,
  source,
  visible,
}: ConversationOptionsModalProps) {
  const sourceCopy = sourceOptionCopy(source);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Đóng tuỳ chọn cuộc trò chuyện"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <LiquidCard
          blurIntensity={34}
          contentStyle={styles.cardContent}
          glowIntensity="low"
          radius={28}
          style={styles.card}
          surfaceBackground="rgba(13, 17, 34, 0.98)"
          variant="purple"
          withInnerReflection
          withShadow={false}
        >
          <View style={styles.handle} />
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              Tuỳ chọn cuộc trò chuyện
            </Text>
            <Text style={styles.subtitle}>
              Quản lý kết nối và nơi cuộc trò chuyện bắt đầu.
            </Text>
          </View>

          <View style={styles.options}>
            {peer ? (
              <OptionRow
                icon="person-circle-outline"
                label={`Xem ${peer.displayName}`}
                onPress={onViewProfile}
                subtitle="Mở hồ sơ người chơi"
              />
            ) : null}
            {sourceCopy ? (
              <OptionRow
                icon={sourceCopy.icon}
                label={sourceCopy.label}
                onPress={onViewSource}
                subtitle={sourceCopy.subtitle}
              />
            ) : null}
            {canMute ? (
              <OptionRow
                disabled={muting}
                icon={
                  isMuted
                    ? 'notifications-outline'
                    : 'notifications-off-outline'
                }
                label={
                  muting
                    ? 'Đang cập nhật…'
                    : isMuted
                      ? 'Bật lại thông báo'
                      : 'Tắt thông báo'
                }
                onPress={onToggleMute}
                subtitle={
                  isMuted
                    ? 'Nhận thông báo mới từ cuộc trò chuyện này'
                    : 'Tin nhắn vẫn được lưu trong hộp thư'
                }
              />
            ) : null}
            {canReport ? (
              <OptionRow
                destructive
                icon="flag-outline"
                label="Báo cáo tin nhắn gần nhất"
                onPress={onReport}
                subtitle="Gửi kèm bằng chứng máy chủ để đội an toàn xem xét"
              />
            ) : null}
          </View>

          <Pressable
            accessibilityLabel="Đóng"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.closeText}>Xong</Text>
          </Pressable>
        </LiquidCard>
      </View>
    </Modal>
  );
}

function OptionRow({
  destructive = false,
  disabled = false,
  icon,
  label,
  onPress,
  subtitle,
}: OptionRowProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[styles.optionIcon, destructive && styles.optionIconDestructive]}
      >
        <Ionicons
          color={destructive ? '#FFB4C2' : 'rgba(220, 208, 255, 0.84)'}
          name={icon}
          size={20}
        />
      </View>
      <View style={styles.optionCopy}>
        <Text
          style={[styles.optionLabel, destructive && styles.destructiveText]}
        >
          {label}
        </Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons
        color="rgba(210, 219, 245, 0.34)"
        name="chevron-forward"
        size={17}
      />
    </Pressable>
  );
}

function sourceOptionCopy(source?: MessageConversationSource) {
  if (source?.type === 'play_session') {
    return {
      icon: 'game-controller-outline' as const,
      label: 'Xem phiên chơi',
      subtitle: 'Lịch, thành viên và trạng thái sẵn sàng',
    };
  }
  if (source?.type === 'direct_match') {
    return {
      icon: 'sparkles-outline' as const,
      label: 'Xem kết nối',
      subtitle: 'Mở chi tiết kết nối đã tạo cuộc trò chuyện',
    };
  }
  return null;
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(2, 4, 12, 0.72)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 14,
  },
  card: { maxWidth: 520, width: '100%' },
  cardContent: {
    gap: 17,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 9,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(145, 105, 255, 0.16)',
    borderColor: 'rgba(194, 169, 255, 0.20)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 46,
  },
  closeText: { color: '#EFEAFF', fontSize: 14, fontWeight: '800' },
  destructiveText: { color: '#FFD3DC' },
  disabled: { opacity: 0.52 },
  handle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(222, 214, 255, 0.24)',
    borderRadius: 999,
    height: 4,
    width: 40,
  },
  heading: { gap: 5, paddingHorizontal: 5 },
  option: {
    alignItems: 'center',
    borderBottomColor: 'rgba(214, 224, 255, 0.07)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 67,
    paddingHorizontal: 4,
    paddingVertical: 9,
  },
  optionCopy: { flex: 1, gap: 3 },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(122, 91, 210, 0.14)',
    borderColor: 'rgba(190, 164, 255, 0.14)',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  optionIconDestructive: {
    backgroundColor: 'rgba(180, 54, 89, 0.12)',
    borderColor: 'rgba(255, 153, 180, 0.14)',
  },
  optionLabel: { color: '#F4F1FF', fontSize: 14, fontWeight: '700' },
  options: { gap: 1 },
  optionSubtitle: {
    color: 'rgba(207, 216, 241, 0.56)',
    fontSize: 11,
    lineHeight: 15,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.992 }] },
  subtitle: {
    color: 'rgba(207, 216, 241, 0.60)',
    fontSize: 12,
    lineHeight: 17,
  },
  title: {
    color: '#FAF8FF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
