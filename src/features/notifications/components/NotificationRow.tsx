import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppCard,
  AppPressableCard,
  AppSurface,
  AppText,
  appColors,
  appRadii,
  appSpacing,
} from '@/shared/ui';

import { NotificationResolvedImage } from './NotificationResolvedImage';
import type {
  NotificationItem,
  NotificationResolvedMedia,
} from '../model/notification-view-model';
import {
  notificationToneVisual,
  notificationsUi,
  resolveNotificationCardVisual,
} from '../ui/notifications-ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function NotificationRow({
  compact,
  item,
  onAction,
}: Readonly<{
  compact: boolean;
  item: NotificationItem;
  onAction: () => void;
}>) {
  const cardVisual = resolveNotificationCardVisual(item.attentionState);
  const hasDestination = Boolean(item.action?.destination);
  const canAcknowledge = item.attentionState !== 'read';
  const interactive = hasDestination || canAcknowledge;
  const radius = compact
    ? notificationsUi.metrics.row.radiusCompact
    : notificationsUi.metrics.row.radius;
  const content = <NotificationRowContent compact={compact} item={item} />;
  const shellProps = {
    backgroundColor: cardVisual.backgroundColor,
    borderOpacity: 0,
    contentStyle: [styles.content, compact && styles.contentCompact],
    density: 'list' as const,
    emphasis: cardVisual.emphasis,
    frameGradient: cardVisual.frameGradient,
    radius,
    surfaceTone: 'low' as const,
    testID: `notification-row-${item.id}`,
    withHighlight: item.attentionState !== 'read',
    withShadow: false,
  };

  return (
    <View style={styles.host}>
      {interactive ? (
        <AppPressableCard
          {...shellProps}
          accessibilityLabel={notificationRowAccessibilityLabel(item)}
          onPress={onAction}
        >
          {content}
        </AppPressableCard>
      ) : (
        <View
          accessibilityLabel={notificationContentAccessibilityLabel(item)}
          accessible
        >
          <AppCard {...shellProps}>{content}</AppCard>
        </View>
      )}
      {cardVisual.attentionColor ? (
        <View
          pointerEvents="none"
          style={styles.attentionHost}
          testID={`notification-attention-${item.id}`}
        >
          <View style={styles.attentionHalo} />
          <View
            style={[
              styles.attentionDot,
              item.attentionState === 'new' && styles.attentionDotNew,
              { backgroundColor: cardVisual.attentionColor },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

function NotificationRowContent({
  compact,
  item,
}: Readonly<{ compact: boolean; item: NotificationItem }>) {
  const tone = notificationToneVisual(item.visual.tone);
  const hasDestination = Boolean(item.action?.destination);
  const [firstPart, secondPart] = item.messageParts;
  const title = item.title || firstPart;
  const body = item.title ? firstPart : secondPart;
  const detail = item.title ? secondPart : undefined;

  return (
    <>
      <NotificationLeadingVisual compact={compact} item={item} />
      <View style={styles.copy}>
        <AppText
          compact={compact}
          numberOfLines={2}
          style={[
            styles.title,
            item.attentionState === 'read' && styles.titleRead,
          ]}
          tone="primary"
          variant="h3"
        >
          {title}
        </AppText>
        {body ? (
          <AppText
            compact={compact}
            numberOfLines={1}
            tone="secondary"
            variant="bodySmall"
          >
            {body}
          </AppText>
        ) : null}
        {detail ? (
          <AppText
            compact={compact}
            numberOfLines={1}
            style={{ color: tone.highlightText }}
            variant="bodySmall"
          >
            {detail}
          </AppText>
        ) : null}
        <AppText tone="muted" variant="caption">
          {item.timeLabel}
        </AppText>
      </View>
      <NotificationTrailingAccessory compact={compact} item={item} />
      {hasDestination ? (
        <Ionicons
          color={appColors.icon.inactive}
          name="chevron-forward"
          size={compact ? 18 : 20}
        />
      ) : null}
    </>
  );
}

function NotificationLeadingVisual({
  compact,
  item,
}: Readonly<{ compact: boolean; item: NotificationItem }>) {
  const size = compact
    ? notificationsUi.metrics.row.visualCompact
    : notificationsUi.metrics.row.visual;
  const tone = notificationToneVisual(item.visual.tone);

  if (item.visual.kind === 'avatar') {
    return (
      <View style={{ height: size, width: size }}>
        <LinearGradient
          colors={tone.avatarRing}
          style={[styles.avatarFrame, { borderRadius: size / 2 }]}
        >
          <NotificationResolvedImage
            accessibilityLabel={`Ảnh đại diện ${item.title}`}
            media={item.visual.media}
            style={[
              styles.avatarImage,
              {
                borderRadius: (size - 4) / 2,
                height: size - 4,
                width: size - 4,
              },
            ]}
          />
        </LinearGradient>
        {item.visual.badgeIcon ? (
          <View
            style={[
              styles.visualBadge,
              {
                backgroundColor: tone.badgeBackground,
                borderColor: tone.border,
              },
            ]}
          >
            <Ionicons
              color={tone.icon}
              name={item.visual.badgeIcon as IconName}
              size={compact ? 10 : 11}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <AppSurface
      backgroundColor={tone.symbolBackground}
      borderColor={tone.border}
      contentStyle={styles.symbolContent}
      emphasis="none"
      frameGradient={notificationsUi.gradients.symbolFrame}
      height={size}
      radius={size / 2}
      surfaceTone="low"
      variant="button"
      width={size}
      withHighlight={false}
      withShadow={false}
    >
      <Ionicons
        color={tone.icon}
        name={item.visual.icon as IconName}
        size={compact ? 22 : 25}
      />
    </AppSurface>
  );
}

function NotificationTrailingAccessory({
  compact,
  item,
}: Readonly<{ compact: boolean; item: NotificationItem }>) {
  if (item.previewAvatars?.length) {
    return (
      <PreviewAvatarStack avatars={item.previewAvatars} compact={compact} />
    );
  }
  if (item.reward) {
    return <NotificationReward compact={compact} item={item} />;
  }
  return null;
}

function PreviewAvatarStack({
  avatars,
  compact,
}: Readonly<{
  avatars: readonly NotificationResolvedMedia[];
  compact: boolean;
}>) {
  const size = compact ? 27 : 31;
  return (
    <View style={styles.previewStack}>
      {avatars.slice(0, 3).map((avatar, index) => (
        <NotificationResolvedImage
          accessibilityLabel="Ảnh người chơi liên quan"
          key={index}
          media={avatar}
          style={[
            styles.previewAvatar,
            index > 0 && styles.previewAvatarOverlap,
            { borderRadius: size / 2, height: size, width: size },
          ]}
        />
      ))}
    </View>
  );
}

function NotificationReward({
  compact,
  item,
}: Readonly<{ compact: boolean; item: NotificationItem }>) {
  if (!item.reward) return null;
  const tone = notificationToneVisual(item.reward.tone);
  return (
    <AppSurface
      backgroundColor={tone.badgeBackground}
      borderColor={notificationsUi.colors.rewardBorder}
      contentStyle={styles.rewardContent}
      emphasis="none"
      radius={appRadii.lg}
      surfaceTone="low"
      variant="button"
      withHighlight={false}
      withShadow={false}
    >
      <Ionicons
        color={tone.icon}
        name={item.reward.icon as IconName}
        size={compact ? 18 : 20}
      />
      {item.reward.label ? (
        <AppText tone="secondary" variant="caption">
          {item.reward.label}
        </AppText>
      ) : null}
    </AppSurface>
  );
}

function notificationRowAccessibilityLabel(item: NotificationItem) {
  const subject = item.title || item.messageParts[0];
  if (item.action?.destination) {
    return [item.action.label, subject].filter(Boolean).join(' ');
  }
  return `Đánh dấu đã đọc ${subject}`;
}

function notificationContentAccessibilityLabel(item: NotificationItem) {
  return [item.title, ...item.messageParts, item.timeLabel]
    .filter(Boolean)
    .join('. ');
}

const styles = StyleSheet.create({
  attentionDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  attentionDotNew: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  attentionHalo: {
    backgroundColor: notificationsUi.colors.attentionHalo,
    borderRadius: 10,
    height: 20,
    position: 'absolute',
    width: 20,
  },
  attentionHost: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    marginTop: -10,
    position: 'absolute',
    right: -8,
    top: '50%',
    width: 20,
  },
  avatarFrame: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  avatarImage: {
    backgroundColor: notificationsUi.colors.mediaFallback,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.xl,
    minHeight: notificationsUi.metrics.row.minHeight,
    overflow: 'hidden',
    paddingHorizontal: appSpacing['2xl'],
    paddingVertical: appSpacing.xl,
  },
  contentCompact: {
    gap: appSpacing.lg,
    minHeight: notificationsUi.metrics.row.minHeightCompact,
    paddingHorizontal: appSpacing.xl,
    paddingVertical: appSpacing.md,
  },
  copy: {
    flex: 1,
    gap: appSpacing.xxs,
    minWidth: 0,
  },
  host: { overflow: 'visible', position: 'relative' },
  previewAvatar: {
    borderColor: notificationsUi.colors.previewAvatarBorder,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewAvatarOverlap: { marginLeft: -appSpacing.md },
  previewStack: { flexDirection: 'row', marginLeft: appSpacing.xs },
  rewardContent: {
    alignItems: 'center',
    gap: appSpacing.xs,
    minHeight: 42,
    minWidth: 42,
    paddingHorizontal: appSpacing.md,
    paddingVertical: appSpacing.sm,
  },
  symbolContent: { alignItems: 'center', justifyContent: 'center', padding: 0 },
  title: { fontWeight: '700' },
  titleRead: { fontWeight: '600' },
  visualBadge: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: -1,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 20,
  },
});
