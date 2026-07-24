import { appRadii, appSpacing } from '@/shared/ui';

import type { NotificationAttentionState } from '../model/notification-attention';
import type { NotificationTone } from '../model/notification-view-model';

type NotificationToneVisual = Readonly<{
  avatarRing: readonly [string, string];
  badgeBackground: string;
  border: string;
  highlightText: string;
  icon: string;
  symbolBackground: string;
}>;

const tones: Record<NotificationTone, NotificationToneVisual> = {
  blue: {
    avatarRing: ['#8E9CFF', '#6575E8'],
    badgeBackground: 'rgba(19,29,62,0.96)',
    border: 'rgba(142,156,255,0.24)',
    highlightText: '#AFC2FF',
    icon: '#AFC2FF',
    symbolBackground: 'rgba(17,25,52,0.96)',
  },
  cyan: {
    avatarRing: ['#67E8FF', '#5570E8'],
    badgeBackground: 'rgba(13,35,43,0.96)',
    border: 'rgba(55,205,255,0.22)',
    highlightText: '#B7F2FF',
    icon: '#55E7FF',
    symbolBackground: 'rgba(12,29,39,0.96)',
  },
  pink: {
    avatarRing: ['#FF8DCE', '#E54A9F'],
    badgeBackground: 'rgba(42,20,36,0.96)',
    border: 'rgba(255,141,206,0.22)',
    highlightText: '#FFACD6',
    icon: '#FF8DCE',
    symbolBackground: 'rgba(38,20,34,0.96)',
  },
  purple: {
    avatarRing: ['#C793FF', '#7A43E8'],
    badgeBackground: 'rgba(29,20,46,0.96)',
    border: 'rgba(183,108,255,0.24)',
    highlightText: '#E0C5FF',
    icon: '#B76CFF',
    symbolBackground: 'rgba(25,18,43,0.96)',
  },
};

export const notificationsUi = {
  colors: {
    attentionNew: '#ED649D',
    attentionUnread: '#B76CFF',
    mediaFallback: '#10162B',
    previewAvatarBorder: 'rgba(255,255,255,0.72)',
    refreshSurface: '#070A18',
    rewardBorder: 'rgba(255,255,255,0.18)',
    richBorder: 'rgba(183,108,255,0.14)',
    richSurface: 'rgba(8,11,25,0.78)',
    separator: 'rgba(153,157,202,0.10)',
  },
  gradients: {
    filterSelected: ['#723DFF', '#C247DE', '#ED649D'] as const,
    symbolFrame: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.025)'] as const,
  },
  metrics: {
    attentionDot: 8,
    attentionDotNew: 9,
    filterHeight: 36,
    row: {
      radiusRich: appRadii.xl,
      richMinHeight: 88,
      richMinHeightCompact: 80,
      standardMinHeight: 72,
      standardMinHeightCompact: 64,
      visual: 48,
      visualCompact: 44,
    },
    stateRadius: appRadii['2xl'],
  },
  spacing: {
    filterGap: appSpacing.md,
    rowHorizontal: appSpacing.lg,
    rowHorizontalCompact: appSpacing.md,
    rowVertical: appSpacing.md,
    rowVerticalCompact: appSpacing.sm,
    sectionGap: appSpacing['3xl'],
    separatorInset: 48 + appSpacing.lg * 2,
  },
  tones,
} as const;

export type NotificationRowVisual = Readonly<{
  attentionColor: string | null;
  attentionSize: number;
}>;

export function resolveNotificationRowVisual(
  state: NotificationAttentionState,
): NotificationRowVisual {
  switch (state) {
    case 'new':
      return {
        attentionColor: notificationsUi.colors.attentionNew,
        attentionSize: notificationsUi.metrics.attentionDotNew,
      };
    case 'unread':
      return {
        attentionColor: notificationsUi.colors.attentionUnread,
        attentionSize: notificationsUi.metrics.attentionDot,
      };
    case 'read':
      return { attentionColor: null, attentionSize: 0 };
    default: {
      const unsupportedState: never = state;
      throw new Error(
        `Unsupported notification attention state: ${String(unsupportedState)}`,
      );
    }
  }
}

export function notificationToneVisual(tone: NotificationTone) {
  return notificationsUi.tones[tone];
}
