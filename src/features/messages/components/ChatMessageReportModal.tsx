import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LiquidButton, LiquidCard } from '@/shared/components/liquid';
import type { ReportCategoryV2 } from '@/shared/contracts/core-v2';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

const reportOptions: readonly Readonly<{
  category: ReportCategoryV2;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}>[] = [
  {
    category: 'harassment',
    description: 'Quấy rối, xúc phạm hoặc liên tục gây áp lực.',
    icon: 'chatbubble-ellipses-outline',
    label: 'Quấy rối',
  },
  {
    category: 'hate',
    description: 'Nội dung thù ghét nhắm vào một nhóm người.',
    icon: 'warning-outline',
    label: 'Thù ghét',
  },
  {
    category: 'threat',
    description: 'Đe doạ gây hại hoặc bạo lực.',
    icon: 'alert-circle-outline',
    label: 'Đe doạ',
  },
  {
    category: 'sexual_content',
    description: 'Nội dung tình dục hoặc gạ gẫm không phù hợp.',
    icon: 'eye-off-outline',
    label: 'Nội dung tình dục',
  },
  {
    category: 'spam',
    description: 'Spam, quảng cáo hoặc lừa đảo.',
    icon: 'mail-unread-outline',
    label: 'Spam hoặc lừa đảo',
  },
  {
    category: 'cheating',
    description: 'Chia sẻ hoặc quảng bá hành vi gian lận.',
    icon: 'game-controller-outline',
    label: 'Gian lận',
  },
  {
    category: 'other',
    description: 'Vấn đề an toàn khác cần được xem xét.',
    icon: 'flag-outline',
    label: 'Lý do khác',
  },
];

export type ChatMessageReportModalProps = Readonly<{
  onClose: () => void;
  onSubmit: (category: ReportCategoryV2) => void;
  pending: boolean;
  visible: boolean;
}>;

export function ChatMessageReportModal({
  onClose,
  onSubmit,
  pending,
  visible,
}: ChatMessageReportModalProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <LiquidCard
          density="large"
          glowIntensity="low"
          style={styles.card}
          surfaceBackground="rgba(19, 15, 39, 0.97)"
          variant="purple"
        >
          <Text style={styles.eyebrow}>AN TOÀN</Text>
          <Text style={styles.title}>Báo cáo tin nhắn</Text>
          <Text style={styles.description}>
            Chọn lý do phù hợp nhất. Báo cáo chưa xác minh không tự động làm
            giảm reputation công khai.
          </Text>
          <ScrollView
            contentContainerStyle={styles.options}
            showsVerticalScrollIndicator={false}
          >
            {reportOptions.map((option) => (
              <Pressable
                accessibilityLabel={`Báo cáo tin nhắn: ${option.label}`}
                accessibilityRole="button"
                disabled={pending}
                key={option.category}
                onPress={() => onSubmit(option.category)}
                style={({ pressed }) => [pressed && !pending && styles.pressed]}
              >
                <LiquidCard
                  density="list"
                  glowIntensity="none"
                  style={styles.optionCard}
                  withShadow={false}
                >
                  <View style={styles.optionRow}>
                    <View style={styles.iconShell}>
                      <Ionicons
                        color="rgba(255,188,203,0.84)"
                        name={option.icon}
                        size={17}
                      />
                    </View>
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionTitle}>{option.label}</Text>
                      <Text style={styles.optionDescription}>
                        {option.description}
                      </Text>
                    </View>
                    <Ionicons
                      color="rgba(219,226,255,0.34)"
                      name="chevron-forward"
                      size={17}
                    />
                  </View>
                </LiquidCard>
              </Pressable>
            ))}
          </ScrollView>
          <LiquidButton
            accessibilityLabel="Đóng báo cáo tin nhắn"
            disabled={pending}
            glowIntensity="none"
            onPress={onClose}
            variant="secondary"
            withShadow={false}
          >
            {pending ? 'Đang gửi…' : 'Huỷ'}
          </LiquidButton>
        </LiquidCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.70)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  card: { maxHeight: '90%', maxWidth: 500, width: '100%' },
  description: {
    color: liquidColors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    textAlign: 'center',
  },
  eyebrow: {
    color: 'rgba(255,188,203,0.62)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.25,
    textAlign: 'center',
  },
  iconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,116,150,0.08)',
    borderColor: 'rgba(255,142,170,0.13)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  optionCard: { marginTop: 8 },
  optionCopy: { flex: 1, minWidth: 0 },
  optionDescription: {
    color: liquidColors.text.muted,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
  },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
  },
  optionTitle: {
    color: liquidColors.text.primary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  options: { paddingBottom: 13 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.992 }] },
  title: {
    color: liquidColors.text.primary,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 5,
    textAlign: 'center',
  },
});
