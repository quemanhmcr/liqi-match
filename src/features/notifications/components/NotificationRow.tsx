import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppSurface,
  AppText,
  appMotion,
  appOpacity,
  appRadii,
  appSpacing,
} from '@/shared/ui';

import { NotificationResolvedImage } from './NotificationResolvedImage';
import { resolveNotificationRowKind } from '../model/notification-row-presentation';
import type {
  NotificationItem,
  NotificationResolvedMedia,
} from '../model/notification-view-model';
import {
  notificationToneVisual,
  notificationsUi,
  resolveNotificationRowVisual,
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
  const rowKind = resolveNotificationRowKind(item);
  const hasDestination = Boolean(item.action?.destination);
  const canAcknowledge = item.attentionState !== 'read';
  const interactive = hasDestination || canAcknowledge;
  const content = (
    <NotificationRowContent compact={compact} item={item} rowKind={rowKind} />
  );

  if (interactive) {
    return (
      <Pressable
        accessibilityLabel={notificationRowAccessibilityLabel(item)}
        accessibilityRole="button"
        onPress={onAction}
        style={({ pressed }) => [pressed && styles.pressed]}
        testID={`notification-row-${item.id}`}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={notificationContentAccessibilityLabel(item)}
      accessible
      testID={`notification-row-${item.id}`}
    >
      {content}
    </View>
  );
}

function NotificationRowContent({
  compact,
  item,
  rowKind,
}: Readonly<{
  compact: boolean;
  item: NotificationItem;
  rowKind: ReturnType<typeof resolveNotificationRowKind>;
}>) {
  const tone = notificationToneVisual(item.visual.tone);
  const rowVisual = resolveNotificationRowVisual(item.attentionState);
  const [firstPart, secondPart] = item.messageParts;
  const title = item.title || firstPart;
  const body = item.title ? firstPart : secondPart;
  const detail = item.title ? secondPart : undefined;
  const minHeight = resolveRowMinHeight(rowKind, compact);

  return (
    <View
      style={[
        styles.content,
        compact && styles.contentCompact,
        rowKind === 'rich' && styles.contentRich,
        { minHeight },
      ]}
      testID={`notification-row-${item.id}-content`}
    >
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
          variant="body"
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
      {rowVisual.attentionColor ? (
        <View
          accessibilityLabel={
            item.attentionState === 'new'
              ? 'Thông báo mới'
              : 'Thông báo chưa đọc'
          }
          accessible
          style={[
            styles.attentionDot,
            {
              backgroundColor: rowVisual.attentionColor,
              borderRadius: rowVisual.attentionSize / 2,
              height: rowVisual.attentionSize,
              width: rowVisual.attentionSize,
            },
          ]}
          testID={`notification-attention-${item.id}`}
        />
      ) : null}
    </View>
  );
}

function resolveRowMinHeight(
  rowKind: ReturnType<typeof resolveNotificationRowKind>,
  compact: boolean,
) {
  if (rowKind === 'rich') {
    return compact
      ? notificationsUi.metrics.row.richMinHeightCompact
      : notificationsUi.metrics.row.richMinHeight;
  }
  return compact
    ? notificationsUi.metrics.row.standardMinHeightCompact
    : notificationsUi.metrics.row.standardMinHeight;
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
              size={compact ? 9 : 10}
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
        size={compact ? 20 : 22}
      />
    </AppSurface>
  );
}

function NotificationTrailingAccessory({
  compact,
  item,
}: Readonly<{ compact: boolean; item: NotificationItem }>) {
  let content: ReactNode = null;
  if (item.previewAvatars?.length) {
    content = (
      <PreviewAvatarStack avatars={item.previewAvatars} compact={compact} />
    );
  } else if (item.reward) {
    content = <NotificationReward compact={compact} item={item} />;
  }
  return content ? <View style={styles.trailing}>{content}</View> : null;
}

function PreviewAvatarStack({
  avatars,
  compact,
}: Readonly<{
  avatars: readonly NotificationResolvedMedia[];
  compact: boolean;
}>) {
  const size = compact ? 26 : 30;
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
        size={compact ? 17 : 19}
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
  attentionDot: { flexShrink: 0, marginLeft: appSpacing.xs },
  avatarFrame: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  avatarImage: { backgroundColor: notificationsUi.colors.mediaFallback },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.lg,
    paddingHorizontal: notificationsUi.spacing.rowHorizontal,
    paddingVertical: notificationsUi.spacing.rowVertical,
  },
  contentCompact: {
    gap: appSpacing.md,
    paddingHorizontal: notificationsUi.spacing.rowHorizontalCompact,
    paddingVertical: notificationsUi.spacing.rowVerticalCompact,
  },
  contentRich: {
    backgroundColor: notificationsUi.colors.richSurface,
    borderColor: notificationsUi.colors.richBorder,
    borderRadius: notificationsUi.metrics.row.radiusRich,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, gap: appSpacing.xxs, minWidth: 0 },
  pressed: {
    opacity: appOpacity.pressed,
    transform: [{ scale: appMotion.subtlePressScale }],
  },
  previewAvatar: {
    borderColor: notificationsUi.colors.previewAvatarBorder,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewAvatarOverlap: { marginLeft: -appSpacing.md },
  previewStack: { flexDirection: 'row' },
  rewardContent: {
    alignItems: 'center',
    gap: appSpacing.xs,
    minHeight: 38,
    minWidth: 38,
    paddingHorizontal: appSpacing.sm,
    paddingVertical: appSpacing.xs,
  },
  symbolContent: { alignItems: 'center', justifyContent: 'center', padding: 0 },
  title: { fontWeight: '700' },
  titleRead: { fontWeight: '500' },
  trailing: { flexShrink: 0, marginLeft: appSpacing.xs },
  visualBadge: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: -1,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 18,
  },
});
