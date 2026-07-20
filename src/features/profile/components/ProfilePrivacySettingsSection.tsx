import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { LiqiButton, LiqiCard, LiqiChip } from '@/shared/components/liqi';
import type { PlayerPrivacySettingsV2 } from '@/shared/contracts/core-v2';
import { liqiColors } from '@/shared/theme/liqi-design-system';

import { ProfileText } from './ProfileShared';

export type PrivacySettingKey =
  | 'profileVisibility'
  | 'presenceVisibility'
  | 'friendshipRequests'
  | 'sessionInvites'
  | 'trustVisibility';

export type PrivacySettingValue = PlayerPrivacySettingsV2[PrivacySettingKey];

type PrivacyOption = Readonly<{
  description: string;
  label: string;
  value: PrivacySettingValue;
}>;

type PrivacySettingDefinition = Readonly<{
  icon: keyof typeof Ionicons.glyphMap;
  options: readonly PrivacyOption[];
  subtitle: string;
  title: string;
}>;

const privacyDefinitions: Record<PrivacySettingKey, PrivacySettingDefinition> =
  {
    profileVisibility: {
      icon: 'person-circle-outline',
      options: [
        {
          description: 'Người chơi đủ điều kiện có thể mở hồ sơ của bạn.',
          label: 'Mọi người',
          value: 'everyone',
        },
        {
          description: 'Chỉ friendship đã được chấp nhận mới xem được hồ sơ.',
          label: 'Chỉ bạn bè',
          value: 'friends',
        },
        {
          description: 'Ẩn hồ sơ khỏi người chơi khác.',
          label: 'Chỉ mình tôi',
          value: 'private',
        },
      ],
      subtitle: 'Block luôn được ưu tiên hơn lựa chọn này.',
      title: 'Ai có thể xem hồ sơ',
    },
    presenceVisibility: {
      icon: 'radio-outline',
      options: [
        {
          description:
            'Người chơi đủ điều kiện có thể thấy trạng thái hoạt động khi presence được phát.',
          label: 'Mọi người',
          value: 'everyone',
        },
        {
          description:
            'Chỉ bạn bè có thể thấy trạng thái hoạt động khi presence được phát.',
          label: 'Chỉ bạn bè',
          value: 'friends',
        },
        {
          description: 'Không cấp quyền đọc presence cho người chơi khác.',
          label: 'Ẩn trạng thái',
          value: 'hidden',
        },
      ],
      subtitle:
        'Đây là quyền xem; không tự tạo trạng thái online hoặc suy luận từ last-seen.',
      title: 'Ai có thể xem trạng thái hoạt động',
    },
    friendshipRequests: {
      icon: 'person-add-outline',
      options: [
        {
          description: 'Người chơi đủ điều kiện có thể gửi lời mời.',
          label: 'Mọi người',
          value: 'everyone',
        },
        {
          description: 'Chỉ người đã ghép đôi với bạn có thể gửi lời mời.',
          label: 'Chỉ người đã match',
          value: 'matched_only',
        },
        {
          description: 'Tạm ngừng nhận lời mời kết bạn mới.',
          label: 'Không ai',
          value: 'nobody',
        },
      ],
      subtitle: 'Lời mời kết bạn luôn tuân theo lựa chọn này.',
      title: 'Ai có thể gửi lời mời kết bạn',
    },
    sessionInvites: {
      icon: 'game-controller-outline',
      options: [
        {
          description: 'Người chơi đủ điều kiện có thể mời bạn vào buổi chơi.',
          label: 'Mọi người',
          value: 'everyone',
        },
        {
          description: 'Chỉ bạn bè có thể mời bạn vào buổi chơi.',
          label: 'Chỉ bạn bè',
          value: 'friends',
        },
        {
          description: 'Tạm ngừng nhận lời mời vào buổi chơi mới.',
          label: 'Không ai',
          value: 'nobody',
        },
      ],
      subtitle:
        'Hệ thống vẫn kiểm tra trạng thái chặn và tài khoản trước khi gửi lời mời.',
      title: 'Ai có thể mời vào buổi chơi',
    },
    trustVisibility: {
      icon: 'shield-checkmark-outline',
      options: [
        {
          description:
            'Người chơi đủ điều kiện có thể xem điểm uy tín của bạn.',
          label: 'Mọi người',
          value: 'everyone',
        },
        {
          description: 'Chỉ bạn bè có thể xem điểm uy tín của bạn.',
          label: 'Chỉ bạn bè',
          value: 'friends',
        },
        {
          description: 'Điểm uy tín chỉ hiển thị cho chính bạn.',
          label: 'Chỉ mình tôi',
          value: 'private',
        },
      ],
      subtitle: 'Lựa chọn hiển thị không thay đổi cách điểm uy tín được tính.',
      title: 'Ai có thể xem uy tín',
    },
  };

const privacySettingOrder: readonly PrivacySettingKey[] = [
  'profileVisibility',
  'presenceVisibility',
  'friendshipRequests',
  'sessionInvites',
  'trustVisibility',
];

export type ProfilePrivacySettingsSectionProps = Readonly<{
  disabled: boolean;
  error: boolean;
  loading: boolean;
  onChange: (key: PrivacySettingKey, value: PrivacySettingValue) => void;
  onRetry?: () => void;
  pendingKey: PrivacySettingKey | null;
  privacy: PlayerPrivacySettingsV2 | null;
}>;

export function ProfilePrivacySettingsSection({
  disabled,
  error,
  loading,
  onChange,
  onRetry,
  pendingKey,
  privacy,
}: ProfilePrivacySettingsSectionProps) {
  const [selectedKey, setSelectedKey] = useState<PrivacySettingKey | null>(
    null,
  );
  const selectedDefinition = selectedKey
    ? privacyDefinitions[selectedKey]
    : null;

  if (!privacy) {
    return (
      <LiqiCard
        contentStyle={styles.unavailableContent}
        density="list"
        emphasis="none"
        style={styles.card}
        withShadow={false}
      >
        <Ionicons
          color="rgba(178,235,255,0.72)"
          name={loading ? 'cloud-download-outline' : 'shield-outline'}
          size={20}
        />
        <View style={styles.copy}>
          <ProfileText style={styles.title}>
            {loading
              ? 'Đang tải quyền riêng tư'
              : 'Quyền riêng tư đang khoá an toàn'}
          </ProfileText>
          <ProfileText style={styles.subtitle}>
            {error
              ? 'Chưa thể xác minh cài đặt quyền riêng tư. Các lựa chọn tạm thời bị khoá để bảo vệ bạn.'
              : 'Đang đồng bộ hồ sơ, trạng thái hoạt động, kết nối và quyền riêng tư.'}
          </ProfileText>
        </View>
        {!loading && error && onRetry ? (
          <LiqiButton
            accessibilityLabel="Thử tải lại quyền riêng tư"
            emphasis="none"
            onPress={onRetry}
            variant="secondary"
            withShadow={false}
          >
            Thử lại
          </LiqiButton>
        ) : null}
      </LiqiCard>
    );
  }

  return (
    <>
      <View style={styles.rows}>
        {privacySettingOrder.map((key) => {
          const definition = privacyDefinitions[key];
          const value = privacy[key];
          const option = definition.options.find(
            (candidate) => candidate.value === value,
          );
          const pending = pendingKey === key;
          return (
            <Pressable
              accessibilityLabel={definition.title}
              accessibilityRole="button"
              disabled={disabled}
              key={key}
              onPress={() => setSelectedKey(key)}
              style={({ pressed }) => [pressed && !disabled && styles.pressed]}
            >
              <LiqiCard
                density="list"
                emphasis="none"
                style={styles.card}
                withShadow={false}
              >
                <View style={[styles.row, disabled && styles.disabled]}>
                  <View style={styles.iconShell}>
                    <Ionicons
                      color="rgba(178,235,255,0.78)"
                      name={definition.icon}
                      size={17}
                    />
                  </View>
                  <View style={styles.copy}>
                    <ProfileText style={styles.title}>
                      {definition.title}
                    </ProfileText>
                    <ProfileText style={styles.subtitle}>
                      {definition.subtitle}
                    </ProfileText>
                  </View>
                  <LiqiChip
                    density="compact"
                    selected
                    variant={pending ? 'orange' : 'purple'}
                  >
                    {pending ? 'Đang lưu…' : (option?.label ?? value)}
                  </LiqiChip>
                  <Ionicons
                    color="rgba(219,226,255,0.38)"
                    name="chevron-forward"
                    size={17}
                  />
                </View>
              </LiqiCard>
            </Pressable>
          );
        })}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedKey(null)}
        transparent
        visible={Boolean(selectedDefinition)}
      >
        <View style={styles.modalBackdrop}>
          {selectedKey && selectedDefinition ? (
            <LiqiCard
              density="large"
              emphasis="low"
              style={styles.modalCard}
              backgroundColor="rgba(20, 16, 42, 0.94)"
              variant="purple"
            >
              <ProfileText style={styles.modalEyebrow}>
                QUYỀN RIÊNG TƯ V2
              </ProfileText>
              <ProfileText style={styles.modalTitle}>
                {selectedDefinition.title}
              </ProfileText>
              <View style={styles.optionList}>
                {selectedDefinition.options.map((option) => {
                  const selected = privacy[selectedKey] === option.value;
                  return (
                    <Pressable
                      accessibilityLabel={`Chọn ${option.label} cho ${selectedDefinition.title}`}
                      accessibilityRole="button"
                      disabled={disabled}
                      key={option.value}
                      onPress={() => {
                        if (selected) {
                          setSelectedKey(null);
                          return;
                        }
                        onChange(selectedKey, option.value);
                        setSelectedKey(null);
                      }}
                      style={({ pressed }) => [
                        pressed && !disabled && styles.pressed,
                      ]}
                    >
                      <LiqiCard
                        density="list"
                        emphasis={selected ? 'low' : 'none'}
                        style={styles.optionCard}
                        variant={selected ? 'cyan' : 'purple'}
                        withShadow={false}
                      >
                        <View style={styles.optionRow}>
                          <View style={styles.optionCopy}>
                            <ProfileText style={styles.optionTitle}>
                              {option.label}
                            </ProfileText>
                            <ProfileText style={styles.optionDescription}>
                              {option.description}
                            </ProfileText>
                          </View>
                          <Ionicons
                            color={
                              selected
                                ? 'rgba(162,243,255,0.92)'
                                : 'rgba(219,226,255,0.34)'
                            }
                            name={
                              selected ? 'checkmark-circle' : 'ellipse-outline'
                            }
                            size={21}
                          />
                        </View>
                      </LiqiCard>
                    </Pressable>
                  );
                })}
              </View>
              <LiqiButton
                accessibilityLabel="Đóng lựa chọn quyền riêng tư"
                disabled={disabled}
                emphasis="none"
                onPress={() => setSelectedKey(null)}
                variant="secondary"
                withShadow={false}
              >
                Huỷ
              </LiqiButton>
            </LiqiCard>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8 },
  copy: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.56 },
  iconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.06)',
    borderColor: 'rgba(103,232,255,0.11)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.66)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: { maxWidth: 480, width: '100%' },
  modalEyebrow: {
    color: 'rgba(186,239,255,0.58)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  modalTitle: {
    color: liqiColors.text.primary,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 5,
    textAlign: 'center',
  },
  optionCard: { marginTop: 8 },
  optionCopy: { flex: 1, minWidth: 0 },
  optionDescription: {
    color: liqiColors.text.muted,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
  },
  optionList: { marginBottom: 14, marginTop: 12 },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
  },
  optionTitle: {
    color: liqiColors.text.primary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  pressed: { opacity: 0.84, transform: [{ scale: 0.992 }] },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
  },
  rows: { marginTop: 2 },
  subtitle: {
    color: liqiColors.text.muted,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
  },
  title: {
    color: liqiColors.text.primary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  unavailableContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 62,
  },
});
