import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { useMemo, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  ToastAndroid,
  useWindowDimensions,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { appRoutes } from '@/app-shell/navigation/routes';
import { usePlayerTrustProjection } from '@/entities/trust-outcomes';
import { useAuth } from '@/shared/auth/auth-context';
import {
  AppActionDock,
  AppButton,
  AppCard,
  AppChip,
  AppIconButton,
  AppScreen,
  AppText,
  appColors,
  appSpacing,
} from '@/shared/ui';

import { ProfileShareCard } from '../components/ProfileShareCard';
import { useProfileReadRepository } from '../runtime/ProfileReadRepositoryProvider';
import {
  profileShareCtaOptions,
  profileSharePreviewWidth,
  profileShareRatioConfig,
  profileShareRatioOptions,
  profileShareTemplateOptions,
  type ProfileShareCta,
  type ProfileShareOption,
  type ProfileShareRatio,
  type ProfileShareTemplate,
} from '../share/profile-share-model';
import type { ProfileViewModel } from '../services/profile-service';
import { fetchProfileSettings } from '../services/profile-settings-service';
import { profileShareUi } from '../ui/profile-share-ui';

export function ProfileShareScreen() {
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const repository = useProfileReadRepository();
  const [template, setTemplate] = useState<ProfileShareTemplate>('fantasy');
  const [ratio, setRatio] = useState<ProfileShareRatio>('story');
  const [cta, setCta] = useState<ProfileShareCta>('teamup');
  const [exporting, setExporting] = useState<'save' | 'share' | null>(null);
  const cardRef = useRef<View>(null);

  const profileQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return repository.getProfile({ session });
    },
    queryKey: ['profile-view', 'self', session?.user.id],
  });
  const settingsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return fetchProfileSettings(session);
    },
    queryKey: ['profile-settings', session?.user.id],
  });
  const profile = profileQuery.data;
  const trustQuery = usePlayerTrustProjection(session, profile?.playerId);
  const selectedCta = useMemo(
    () =>
      profileShareCtaOptions.find((option) => option.id === cta) ??
      profileShareCtaOptions[0]!,
    [cta],
  );
  const previewWidth = Math.min(
    profileSharePreviewWidth(ratio),
    Math.max(214, width - appSpacing['4xl'] * 2),
  );

  if (!session) {
    return (
      <ProfileShareState
        actionLabel="Về đăng nhập"
        description="Đăng nhập để tạo ảnh chia sẻ từ hồ sơ của bạn."
        icon="lock-closed-outline"
        onAction={() => router.replace(appRoutes.auth.login)}
        title="Cần đăng nhập"
      />
    );
  }

  if (settingsQuery.isLoading) {
    return (
      <ProfileShareState
        description="Đang xác nhận quyền riêng tư trước khi dựng ảnh hồ sơ."
        icon="shield-checkmark-outline"
        loading
        title="Đang kiểm tra quyền chia sẻ"
      />
    );
  }

  if (settingsQuery.isError) {
    return (
      <ProfileShareState
        actionLabel="Thử lại"
        description="Màn hình tạm khoá vì chưa đọc được cài đặt quyền riêng tư mới nhất."
        icon="warning-outline"
        onAction={() => void settingsQuery.refetch()}
        title="Chưa kiểm tra được quyền chia sẻ"
      />
    );
  }

  if (settingsQuery.data?.allowProfileShare !== true) {
    return (
      <ProfileShareState
        actionLabel="Mở cài đặt"
        description="Bạn đang tắt quyền tạo ảnh chia sẻ. Bật lại trong Cài đặt hồ sơ để tiếp tục."
        icon="image-outline"
        onAction={() => router.replace(appRoutes.profile.settings)}
        title="Đang tắt chia sẻ hồ sơ"
      />
    );
  }

  if (profileQuery.isPending) {
    return (
      <ProfileShareState
        description="Đang đồng bộ identity và media mới nhất của hồ sơ."
        icon="person-circle-outline"
        loading
        title="Đang tải hồ sơ"
      />
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <ProfileShareState
        actionLabel="Thử lại"
        description="Không dùng fixture thay thế vì ảnh chia sẻ phải phản ánh đúng hồ sơ hiện tại."
        icon="warning-outline"
        onAction={() => void profileQuery.refetch()}
        title={
          profileQuery.isError ? 'Không thể tải hồ sơ' : 'Không tìm thấy hồ sơ'
        }
      />
    );
  }

  if (trustQuery.isPending) {
    return (
      <ProfileShareState
        description="Đang tải số buổi chơi, độ hoàn tất và lời khen đã xác minh."
        icon="shield-checkmark-outline"
        loading
        title="Đang tải số liệu xác minh"
      />
    );
  }

  if (trustQuery.isError) {
    return (
      <ProfileShareState
        actionLabel="Thử lại"
        description="Ảnh chia sẻ được khoá để không hiển thị thành tích tự khai hoặc dữ liệu cũ chưa xác minh."
        icon="warning-outline"
        onAction={() => void trustQuery.refetch()}
        title="Chưa tải được số liệu xác minh"
      />
    );
  }

  const exportImage = async (action: 'save' | 'share') => {
    if (exporting) return;
    setExporting(action);
    try {
      await exportProfileShareImage({ action, cardRef, profile, ratio });
    } finally {
      setExporting(null);
    }
  };

  return (
    <AppScreen
      bottomSlot={
        <ProfileShareActionDock
          exporting={exporting}
          onSave={() => void exportImage('save')}
          onShare={() => void exportImage('share')}
        />
      }
      contentContainerStyle={styles.screenContent}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <ProfileShareHeader onBack={leaveShare} />

      <View style={styles.previewStage}>
        <ProfileShareCard
          captureRef={cardRef}
          cta={selectedCta.text}
          previewWidth={previewWidth}
          profile={profile}
          ratio={ratio}
          template={template}
          trustProjection={trustQuery.data}
        />
      </View>

      <AppCard
        backgroundColor={profileShareUi.colors.controlSurface}
        contentStyle={styles.controlsContent}
        radius={profileShareUi.radii.control}
        withShadow={false}
      >
        <ShareOptionGroup
          label="Mẫu thiết kế"
          onSelect={setTemplate}
          options={profileShareTemplateOptions}
          selected={template}
        />
        <View style={styles.divider} />
        <ShareOptionGroup
          label="Tỉ lệ ảnh"
          onSelect={setRatio}
          options={profileShareRatioOptions}
          selected={ratio}
          tone="cyan"
        />
        <View style={styles.divider} />
        <ShareOptionGroup
          label="Thông điệp"
          onSelect={setCta}
          options={profileShareCtaOptions}
          selected={cta}
        />
      </AppCard>

      <View style={styles.authorityNote}>
        <Ionicons
          color={appColors.accent.purpleIcon}
          name="shield-checkmark-outline"
          size={18}
        />
        <View style={styles.authorityCopy}>
          <AppText variant="label">Thành tích trên ảnh được xác minh</AppText>
          <AppText tone="secondary" variant="bodySmall">
            Thẻ chỉ dùng trust projection của nền tảng; social stats và legacy
            profile stats không được dùng làm fallback.
          </AppText>
        </View>
      </View>
    </AppScreen>
  );
}

function ProfileShareHeader({ onBack }: Readonly<{ onBack: () => void }>) {
  return (
    <View style={styles.header}>
      <AppIconButton
        accessibilityLabel="Quay lại hồ sơ"
        emphasis="low"
        onPress={onBack}
        size={44}
        surfaceTone="low"
        withHighlight={false}
      >
        <Ionicons
          color={appColors.icon.primary}
          name="chevron-back"
          size={21}
        />
      </AppIconButton>
      <View style={styles.headerCopy}>
        <AppText variant="h1">Chia sẻ hồ sơ</AppText>
        <AppText tone="secondary" variant="bodySmall">
          Tạo một ảnh có chủ đích để đăng story, feed hoặc gửi trong chat.
        </AppText>
      </View>
    </View>
  );
}

function ProfileShareState({
  actionLabel,
  description,
  icon,
  loading = false,
  onAction,
  title,
}: Readonly<{
  actionLabel?: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  onAction?: () => void;
  title: string;
}>) {
  return (
    <AppScreen
      contentContainerStyle={styles.stateScreen}
      scroll={false}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <View style={styles.stateHeader}>
        <AppIconButton
          accessibilityLabel="Quay lại hồ sơ"
          emphasis="low"
          onPress={leaveShare}
          size={44}
          surfaceTone="low"
          withHighlight={false}
        >
          <Ionicons
            color={appColors.icon.primary}
            name="chevron-back"
            size={21}
          />
        </AppIconButton>
      </View>
      <AppCard
        backgroundColor={profileShareUi.colors.guardSurface}
        contentStyle={styles.stateCard}
        withShadow={false}
      >
        {loading ? (
          <ActivityIndicator color={appColors.accent.purpleIcon} size="large" />
        ) : (
          <Ionicons color={appColors.accent.purpleIcon} name={icon} size={32} />
        )}
        <AppText variant="h2">{title}</AppText>
        <AppText style={styles.centerText} tone="secondary" variant="bodySmall">
          {description}
        </AppText>
        {actionLabel && onAction ? (
          <AppButton onPress={onAction} variant="secondary" withShadow={false}>
            {actionLabel}
          </AppButton>
        ) : null}
      </AppCard>
    </AppScreen>
  );
}

function ShareOptionGroup<Value extends string>({
  label,
  onSelect,
  options,
  selected,
  tone = 'purple',
}: Readonly<{
  label: string;
  onSelect: (value: Value) => void;
  options: readonly ProfileShareOption<Value>[];
  selected: Value;
  tone?: 'purple' | 'cyan';
}>) {
  return (
    <View style={styles.optionGroup}>
      <AppText variant="h3">{label}</AppText>
      <View style={styles.optionWrap}>
        {options.map((option) => (
          <View key={option.id} style={styles.optionItem}>
            <AppChip
              accessibilityLabel={`${label} ${option.label}`}
              accessibilityState={{ selected: option.id === selected }}
              density="compact"
              onPress={() => {
                selectionImpact();
                onSelect(option.id);
              }}
              selected={option.id === selected}
              variant={tone}
            >
              {option.label}
            </AppChip>
            {option.meta ? (
              <AppText tone="muted" variant="caption">
                {option.meta}
              </AppText>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function ProfileShareActionDock({
  exporting,
  onSave,
  onShare,
}: Readonly<{
  exporting: 'save' | 'share' | null;
  onSave: () => void;
  onShare: () => void;
}>) {
  return (
    <AppActionDock contentStyle={styles.actionDockContent}>
      <AppButton
        accessibilityLabel="Lưu ảnh hồ sơ"
        disabled={exporting !== null}
        onPress={onSave}
        style={styles.actionButton}
        variant="ghost"
        withShadow={false}
      >
        {exporting === 'save' ? (
          <ActivityIndicator color={appColors.text.secondary} size="small" />
        ) : (
          <Ionicons
            color={appColors.icon.primary}
            name="download-outline"
            size={18}
          />
        )}
        <AppText variant="button">Lưu ảnh</AppText>
      </AppButton>
      <AppButton
        accessibilityLabel="Chia sẻ ảnh hồ sơ"
        disabled={exporting !== null}
        onPress={onShare}
        style={styles.actionButton}
        withShadow={false}
      >
        {exporting === 'share' ? (
          <ActivityIndicator color={appColors.text.onAccent} size="small" />
        ) : (
          <Ionicons
            color={appColors.text.onAccent}
            name="share-social-outline"
            size={18}
          />
        )}
        <AppText variant="button">Chia sẻ</AppText>
      </AppButton>
    </AppActionDock>
  );
}

async function exportProfileShareImage({
  action,
  cardRef,
  profile,
  ratio,
}: Readonly<{
  action: 'save' | 'share';
  cardRef: RefObject<View | null>;
  profile: ProfileViewModel;
  ratio: ProfileShareRatio;
}>) {
  impactLight();
  try {
    const uri = await captureProfileShareCard(
      cardRef,
      profile.displayName,
      ratio,
    );
    if (action === 'save') {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Cần quyền lưu ảnh',
          'Cấp quyền thư viện ảnh để lưu thẻ hồ sơ vào thiết bị.',
        );
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      showFeedback('Đã lưu ảnh hồ sơ');
      return;
    }

    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert(
        'Không chia sẻ được',
        'Thiết bị hiện không hỗ trợ native share sheet cho ảnh.',
      );
      return;
    }
    await Sharing.shareAsync(uri, {
      dialogTitle: `Chia sẻ hồ sơ của ${profile.displayName}`,
      mimeType: 'image/png',
      UTI: 'public.png',
    });
  } catch (error) {
    Alert.alert(
      action === 'save' ? 'Không lưu được ảnh' : 'Không chia sẻ được ảnh',
      error instanceof Error ? error.message : 'Vui lòng thử lại.',
    );
  }
}

async function captureProfileShareCard(
  cardRef: RefObject<View | null>,
  displayName: string,
  ratio: ProfileShareRatio,
) {
  if (!cardRef.current) {
    throw new Error('Thẻ ảnh chưa sẵn sàng. Hãy thử lại sau một chút.');
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const config = profileShareRatioConfig(ratio);
  const safeName = displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return captureRef(cardRef.current, {
    fileName: `liqi-profile-${safeName || 'player'}-${Date.now()}`,
    format: 'png',
    height: config.exportHeight,
    quality: 1,
    result: 'tmpfile',
    width: config.exportWidth,
  });
}

function leaveShare() {
  selectionImpact();
  if (router.canGoBack?.()) {
    router.back();
    return;
  }
  router.replace(appRoutes.profile.self);
}

function showFeedback(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert(message);
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function impactLight() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}

const styles = StyleSheet.create({
  actionButton: { flex: 1, minWidth: 0 },
  actionDockContent: { gap: appSpacing.md, width: '100%' },
  authorityCopy: { flex: 1, gap: appSpacing.xs },
  authorityNote: {
    alignItems: 'flex-start',
    backgroundColor: profileShareUi.colors.guardSurface,
    borderColor: profileShareUi.colors.cardBorder,
    borderRadius: profileShareUi.radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: appSpacing.lg,
    padding: appSpacing.xl,
  },
  centerText: { maxWidth: 320, textAlign: 'center' },
  controlsContent: { gap: appSpacing.xl },
  divider: {
    backgroundColor: profileShareUi.colors.divider,
    height: StyleSheet.hairlineWidth,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.xl,
  },
  headerCopy: { flex: 1, gap: appSpacing.xxs },
  optionGroup: { gap: appSpacing.lg },
  optionItem: { alignItems: 'flex-start', gap: appSpacing.xs },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: appSpacing.lg },
  previewStage: { alignItems: 'center' },
  screenContent: {
    gap: profileShareUi.screen.gap,
    paddingBottom: profileShareUi.screen.bottomContentInset,
  },
  stateCard: {
    alignItems: 'center',
    gap: appSpacing.xl,
    justifyContent: 'center',
    minHeight: 270,
  },
  stateHeader: { alignSelf: 'stretch' },
  stateScreen: {
    flex: 1,
    gap: appSpacing['3xl'],
    justifyContent: 'center',
    paddingBottom: appSpacing['4xl'],
  },
});
