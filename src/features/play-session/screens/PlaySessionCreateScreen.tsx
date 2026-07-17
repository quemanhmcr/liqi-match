import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { usePlayerIdentities } from '@/entities/player-identity';
import { usePlaySessionServices } from '@/entities/play-session';
import { FriendPlayerPickerModal } from '@/entities/social-relationship/ui';
import { useAuth } from '@/shared/auth/auth-context';
import type { PlayerId } from '@/shared/contracts/core-v1';
import type { CreatePlaySessionCommandV2 } from '@/shared/contracts/core-v2';
import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
} from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';

import { presentPlaySessionError } from '../model/play-session-error-presentation';
import {
  prepareCoreV2CommandMetadata,
  usePlaySessionCommandMutation,
} from '../queries/play-session-queries';

type ScheduleChoice = 'later' | 'now' | 'tonight' | 'tomorrow';

type PendingCreateAttempt = Readonly<{
  command: CreatePlaySessionCommandV2;
  fingerprint: string;
}>;

export function PlaySessionCreateScreen() {
  const { commandService } = usePlaySessionServices();
  const { session } = useAuth();
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const pendingAttemptRef = useRef<PendingCreateAttempt | null>(null);
  const submittedPlayerIdRef = useRef<string | null>(null);
  const currentPlayerIdRef = useRef(session?.principal?.playerId ?? null);
  const [title, setTitle] = useState('Party tối nay');
  const [capacity, setCapacity] = useState(3);
  const [invitees, setInvitees] = useState<readonly PlayerId[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [scheduleChoice, setScheduleChoice] =
    useState<ScheduleChoice>('tonight');
  const [validationError, setValidationError] = useState<string | null>(null);
  const identities = usePlayerIdentities(invitees);
  const identityById = new Map(
    (identities.data ?? []).map((identity) => [identity.playerId, identity]),
  );
  const create = usePlaySessionCommandMutation<CreatePlaySessionCommandV2>(
    (actor, command) => commandService.create(actor, command),
    {
      onError: () => {
        submittingRef.current = false;
      },
      onSuccess: (receipt) => {
        submittingRef.current = false;
        pendingAttemptRef.current = null;
        if (
          !mountedRef.current ||
          currentPlayerIdRef.current !== submittedPlayerIdRef.current
        ) {
          return;
        }
        router.replace(appRoutes.sessions.detail(receipt.aggregateId));
      },
    },
  );
  const createFailure = create.error
    ? presentPlaySessionError(create.error, 'create')
    : null;

  useEffect(() => {
    currentPlayerIdRef.current = session?.principal?.playerId ?? null;
  }, [session?.principal?.playerId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submittingRef.current = false;
    };
  }, []);

  const resetCreateAttempt = () => {
    pendingAttemptRef.current = null;
    submittedPlayerIdRef.current = null;
    create.reset();
    setValidationError(null);
  };

  const changeCapacity = (value: number) => {
    setCapacity(value);
    if (invitees.length > value - 1) setInvitees(invitees.slice(0, value - 1));
    resetCreateAttempt();
  };

  const submit = () => {
    if (submittingRef.current || create.isPending) return;

    const normalizedTitle = title.trim();
    if (normalizedTitle.length < 2) {
      setValidationError('Tên buổi chơi cần ít nhất 2 ký tự.');
      return;
    }
    if (invitees.length > capacity - 1) {
      setValidationError(
        `Buổi chơi ${capacity} người chỉ có thể mời trước ${capacity - 1} người.`,
      );
      return;
    }
    setValidationError(null);
    const timezone = resolvedTimezone();
    const fingerprint = createDraftFingerprint({
      capacity,
      invitees,
      scheduleChoice,
      timezone,
      title: normalizedTitle,
    });
    let attempt = pendingAttemptRef.current;
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = {
        command: {
          ...prepareCoreV2CommandMetadata(0),
          capacity,
          initialInviteePlayerIds: [...invitees],
          scheduledFor: scheduleValue(scheduleChoice),
          timezone,
          title: normalizedTitle,
        },
        fingerprint,
      };
      pendingAttemptRef.current = attempt;
    }

    submittingRef.current = true;
    submittedPlayerIdRef.current = currentPlayerIdRef.current;
    create.mutate(attempt.command);
  };

  return (
    <LiquidScreen
      contentContainerStyle={styles.screen}
      subtitle="Chọn bạn bè, lịch chơi và quy mô đội"
      title="Tạo buổi chơi"
      withBottomNavPadding={false}
    >
      <LiquidCard
        contentStyle={styles.card}
        radius={28}
        variant="purple"
        withInnerReflection
      >
        <FieldLabel icon="game-controller-outline">Tên buổi chơi</FieldLabel>
        <TextInput
          accessibilityLabel="Tên buổi chơi"
          maxLength={80}
          editable={!create.isPending}
          onChangeText={(value) => {
            setTitle(value);
            resetCreateAttempt();
          }}
          placeholder="Party tối nay"
          placeholderTextColor="rgba(217,224,246,0.36)"
          style={styles.input}
          value={title}
        />

        <FieldLabel icon="people-outline">Quy mô đội</FieldLabel>
        <View style={styles.wrapRow}>
          {[2, 3, 4, 5].map((value) => (
            <LiquidChip
              disabled={create.isPending}
              key={value}
              onPress={() => changeCapacity(value)}
              selected={capacity === value}
              variant="purple"
            >
              {value} người
            </LiquidChip>
          ))}
        </View>

        <FieldLabel icon="calendar-outline">Thời gian bắt đầu</FieldLabel>
        <View style={styles.wrapRow}>
          {(
            [
              ['now', 'Khi đủ người'],
              ['later', 'Sau 30 phút'],
              ['tonight', 'Tối nay'],
              ['tomorrow', 'Tối mai'],
            ] as const
          ).map(([value, label]) => (
            <LiquidChip
              disabled={create.isPending}
              key={value}
              onPress={() => {
                setScheduleChoice(value);
                resetCreateAttempt();
              }}
              selected={scheduleChoice === value}
              variant="cyan"
            >
              {label}
            </LiquidChip>
          ))}
        </View>
      </LiquidCard>

      <LiquidCard
        contentStyle={styles.inviteCard}
        radius={25}
        variant="cyan"
        withShadow={false}
      >
        <View style={styles.sectionHeading}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Mời bạn bè</Text>
            <Text style={styles.sectionDescription}>
              {invitees.length}/{capacity - 1} vị trí mời trước
            </Text>
          </View>
          <LiquidButton
            disabled={create.isPending}
            onPress={() => setPickerVisible(true)}
            variant="ghost"
          >
            {invitees.length ? 'Thay đổi' : 'Chọn bạn'}
          </LiquidButton>
        </View>
        {invitees.length ? (
          <View style={styles.inviteeList}>
            {invitees.map((playerId, index) => {
              const identity = identityById.get(playerId);
              return (
                <View key={playerId} style={styles.inviteeRow}>
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
                  <View style={styles.inviteeCopy}>
                    <Text numberOfLines={1} style={styles.inviteeName}>
                      {identity?.displayName ?? `Người chơi ${index + 1}`}
                    </Text>
                    <Text style={styles.inviteeMeta}>
                      {identity?.rank?.name ??
                        identity?.primaryRole?.name ??
                        'Bạn bè trên LIQI'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Bỏ ${identity?.displayName ?? 'người chơi'} khỏi lời mời`}
                    accessibilityRole="button"
                    disabled={create.isPending}
                    onPress={() => {
                      setInvitees(invitees.filter((id) => id !== playerId));
                      resetCreateAttempt();
                    }}
                    style={styles.removeButton}
                  >
                    <Ionicons
                      color="rgba(232,221,255,0.68)"
                      name="close"
                      size={17}
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyInvite}>
            <Ionicons
              color="rgba(190,207,236,0.42)"
              name="person-add-outline"
              size={25}
            />
            <Text style={styles.emptyText}>
              Bạn có thể tạo trước rồi mời thêm sau.
            </Text>
          </View>
        )}
      </LiquidCard>

      <LiquidCard
        contentStyle={styles.note}
        density="compact"
        radius={20}
        variant="purple"
        withShadow={false}
      >
        <Ionicons color="#CBB6FF" name="shield-checkmark-outline" size={18} />
        <Text style={styles.noteText}>
          Quyền mời và trạng thái tài khoản được kiểm tra lại khi tạo buổi chơi.
        </Text>
      </LiquidCard>

      {validationError || createFailure ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {validationError ?? createFailure?.message}
        </Text>
      ) : null}
      <LiquidButton
        disabled={create.isPending}
        onPress={submit}
        variant="primary"
      >
        {create.isPending
          ? 'Đang tạo…'
          : createFailure?.retryable
            ? 'Thử tạo lại'
            : 'Tạo buổi chơi'}
      </LiquidButton>
      <LiquidButton
        disabled={create.isPending}
        onPress={() => router.back()}
        variant="ghost"
      >
        Huỷ
      </LiquidButton>

      {pickerVisible && !create.isPending ? (
        <FriendPlayerPickerModal
          excludedPlayerIds={[]}
          maxSelected={capacity - 1}
          onClose={() => setPickerVisible(false)}
          onConfirm={(playerIds) => {
            setInvitees(playerIds);
            setPickerVisible(false);
            resetCreateAttempt();
          }}
          purpose="session"
          selectedPlayerIds={invitees}
          setSelectedPlayerIds={(playerIds) => {
            setInvitees(playerIds);
            resetCreateAttempt();
          }}
          title="Mời vào buổi chơi"
          visible
        />
      ) : null}
    </LiquidScreen>
  );
}

function FieldLabel({
  children,
  icon,
}: {
  children: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.labelRow}>
      <Ionicons color="#CBB6FF" name={icon} size={16} />
      <Text style={styles.label}>{children}</Text>
    </View>
  );
}
function createDraftFingerprint(input: {
  capacity: number;
  invitees: readonly PlayerId[];
  scheduleChoice: ScheduleChoice;
  timezone: string;
  title: string;
}) {
  return JSON.stringify({
    capacity: input.capacity,
    invitees: [...input.invitees].sort(),
    scheduleChoice: input.scheduleChoice,
    timezone: input.timezone,
    title: input.title,
  });
}

function resolvedTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok';
}
function scheduleValue(choice: ScheduleChoice) {
  if (choice === 'now') return null;
  const date = new Date();
  if (choice === 'later') date.setMinutes(date.getMinutes() + 30);
  if (choice === 'tonight') {
    date.setHours(20, 0, 0, 0);
    if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  }
  if (choice === 'tomorrow') {
    date.setDate(date.getDate() + 1);
    date.setHours(20, 0, 0, 0);
  }
  return date.toISOString();
}
const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(129,91,220,0.17)',
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 42,
  },
  avatarImage: { height: '100%', width: '100%' },
  card: { gap: 13, padding: 18 },
  emptyInvite: { alignItems: 'center', gap: 8, paddingVertical: 17 },
  emptyText: { color: 'rgba(209,219,243,0.54)', fontSize: 11.5 },
  error: {
    color: '#FFB9C5',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  initial: { color: '#E1D4FF', fontSize: 13, fontWeight: '800' },
  input: {
    backgroundColor: 'rgba(7,11,25,0.46)',
    borderColor: 'rgba(197,176,255,0.16)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#F8F6FF',
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 15,
  },
  inviteCard: { gap: 12, padding: 16 },
  inviteeCopy: { flex: 1, gap: 3, minWidth: 0 },
  inviteeList: { gap: 1 },
  inviteeMeta: { color: 'rgba(207,217,241,0.54)', fontSize: 10.5 },
  inviteeName: { color: '#F6F3FF', fontSize: 13.5, fontWeight: '800' },
  inviteeRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(211,221,246,0.07)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 11,
    minHeight: 61,
    paddingVertical: 6,
  },
  label: { color: '#F0EBFF', fontSize: 13, fontWeight: '800' },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 3,
  },
  note: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    padding: 13,
  },
  noteText: {
    color: 'rgba(214,224,245,0.64)',
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
  },
  removeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(122,86,191,0.10)',
    borderRadius: 14,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  screen: { gap: 14 },
  sectionCopy: { flex: 1, gap: 3 },
  sectionDescription: { color: 'rgba(207,217,241,0.54)', fontSize: 10.5 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  sectionTitle: { color: '#F3EFFF', fontSize: 15, fontWeight: '800' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
