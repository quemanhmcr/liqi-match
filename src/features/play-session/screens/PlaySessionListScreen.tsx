import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { usePlaySessionServices } from '@/entities/play-session';
import type { AcceptSessionInviteCommandV2 } from '@/shared/contracts/core-v2';
import { LiquidButton, LiquidCard } from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import {
  prepareCoreV2CommandMetadata,
  useCurrentPlaySessions,
  usePlaySessionCommandMutation,
  usePlaySessionInvites,
} from '../queries/play-session-queries';

export function PlaySessionListScreen() {
  const current = useCurrentPlaySessions();
  const invites = usePlaySessionInvites();
  const { commandService } = usePlaySessionServices();
  const accept = usePlaySessionCommandMutation<AcceptSessionInviteCommandV2>(
    (actor, command) => commandService.acceptInvite(actor, command),
  );
  const loading = current.isLoading || invites.isLoading;
  const error = current.error ?? invites.error ?? accept.error;

  return (
    <LiquidScreen
      subtitle="Buổi chơi authoritative, ready-check và kết quả được ghi nhận theo thành viên."
      title="Party & Session"
    >
      <LiquidButton onPress={() => router.push(appRoutes.sessions.create)}>
        Tạo buổi chơi
      </LiquidButton>

      <SectionTitle>Lời mời đang chờ</SectionTitle>
      {invites.data?.map((invite) => (
        <LiquidCard key={invite.inviteId} style={styles.card} variant="cyan">
          <Text style={styles.title}>{invite.session.title}</Text>
          <Text style={styles.meta}>
            {invite.session.members.length}/{invite.session.capacity} thành viên
            · v{invite.session.version}
          </Text>
          <View style={styles.actions}>
            <LiquidButton
              disabled={accept.isPending}
              onPress={() =>
                accept.mutate({
                  ...prepareCoreV2CommandMetadata(invite.session.version),
                  inviteId: invite.inviteId,
                  sessionId: invite.sessionId,
                })
              }
              variant="rank"
            >
              Tham gia
            </LiquidButton>
            <LiquidButton
              onPress={() =>
                router.push(appRoutes.sessions.detail(invite.sessionId))
              }
              variant="ghost"
            >
              Xem chi tiết
            </LiquidButton>
          </View>
        </LiquidCard>
      ))}
      {!invites.data?.length && !loading ? (
        <EmptyText>Không có lời mời đang chờ.</EmptyText>
      ) : null}

      <SectionTitle>Hoạt động hiện tại</SectionTitle>
      {current.data?.map((session) => (
        <Pressable
          accessibilityRole="button"
          key={session.sessionId}
          onPress={() =>
            router.push(appRoutes.sessions.detail(session.sessionId))
          }
        >
          <LiquidCard style={styles.card} variant="purple">
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.title}>{session.title}</Text>
                <Text style={styles.meta}>
                  {stateLabel(session.state)} · {session.members.length}/
                  {session.capacity} thành viên
                </Text>
              </View>
              <Text style={styles.version}>v{session.version}</Text>
            </View>
          </LiquidCard>
        </Pressable>
      ))}
      {!current.data?.length && !loading ? (
        <EmptyText>Chưa có buổi chơi đang hoạt động.</EmptyText>
      ) : null}

      {loading ? <ActivityIndicator color={liquidColors.text.primary} /> : null}
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
    </LiquidScreen>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}
function EmptyText({ children }: { children: string }) {
  return <Text style={styles.empty}>{children}</Text>;
}
function stateLabel(state: string) {
  return state.replaceAll('_', ' ');
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  card: { marginTop: 10 },
  empty: { ...liquidTypography.body, opacity: 0.72, paddingVertical: 12 },
  error: { color: '#FF9CB5', marginTop: 14 },
  grow: { flex: 1 },
  meta: { ...liquidTypography.body, marginTop: 5 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  section: { ...liquidTypography.sectionTitle, marginTop: 24 },
  title: { ...liquidTypography.cardTitle, color: liquidColors.text.primary },
  version: { ...liquidTypography.body, opacity: 0.65 },
});
