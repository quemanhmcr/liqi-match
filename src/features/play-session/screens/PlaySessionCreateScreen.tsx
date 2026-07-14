import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { usePlaySessionServices } from '@/entities/play-session';
import { PlayerIdSchema } from '@/shared/contracts/core-v1';
import type { CreatePlaySessionCommandV2 } from '@/shared/contracts/core-v2';
import { LiquidButton, LiquidCard } from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import {
  prepareCoreV2CommandMetadata,
  usePlaySessionCommandMutation,
} from '../queries/play-session-queries';

export function PlaySessionCreateScreen() {
  const { commandService } = usePlaySessionServices();
  const [title, setTitle] = useState('Party tối nay');
  const [capacity, setCapacity] = useState(2);
  const [invitees, setInvitees] = useState('');
  const create = usePlaySessionCommandMutation<CreatePlaySessionCommandV2>(
    (actor, command) => commandService.create(actor, command),
    {
      onSuccess: (receipt) => {
        router.replace(appRoutes.sessions.detail(receipt.aggregateId));
      },
    },
  );

  const submit = () => {
    const initialInviteePlayerIds = invitees
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => PlayerIdSchema.parse(value));
    create.mutate({
      ...prepareCoreV2CommandMetadata(0),
      capacity,
      initialInviteePlayerIds,
      scheduledFor: null,
      timezone: resolvedTimezone(),
      title: title.trim(),
    });
  };

  return (
    <LiquidScreen
      subtitle="Có thể mời thành viên ngay; mọi quyền mời được kiểm tra lại tại server."
      title="Tạo Session"
      withBottomNavPadding={false}
    >
      <LiquidCard>
        <Label>Tên buổi chơi</Label>
        <TextInput
          accessibilityLabel="Tên buổi chơi"
          maxLength={80}
          onChangeText={setTitle}
          placeholder="Party tối nay"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
          value={title}
        />
        <Label>Số người tối đa</Label>
        <View style={styles.row}>
          {[2, 3, 4, 5].map((value) => (
            <LiquidButton
              key={value}
              onPress={() => setCapacity(value)}
              variant={capacity === value ? 'primary' : 'ghost'}
            >
              {value}
            </LiquidButton>
          ))}
        </View>
        <Label>PlayerId mời ban đầu, phân cách bằng dấu phẩy</Label>
        <TextInput
          accessibilityLabel="PlayerId mời ban đầu"
          autoCapitalize="none"
          onChangeText={setInvitees}
          placeholder="UUID, UUID"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={[styles.input, styles.multiline]}
          value={invitees}
        />
      </LiquidCard>
      <LiquidButton
        disabled={create.isPending}
        onPress={submit}
        style={styles.submit}
      >
        {create.isPending ? 'Đang tạo…' : 'Tạo buổi chơi'}
      </LiquidButton>
      {create.error ? (
        <Text style={styles.error}>{create.error.message}</Text>
      ) : null}
    </LiquidScreen>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}
function resolvedTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok';
}

const styles = StyleSheet.create({
  error: { color: '#FF9CB5', marginTop: 12 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    borderWidth: 1,
    color: liquidColors.text.primary,
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  label: { ...liquidTypography.cardTitle, marginTop: 16 },
  multiline: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  submit: { marginTop: 18 },
});
