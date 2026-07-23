import { appGradients, appRadii, appSpacing } from '@/shared/ui';

import type { MessageInboxAttentionState } from '../model/message-inbox-attention';

/** Visual recipes owned by Messages and Chat. Shared components must not import this file. */
export const messagesUi = {
  colors: {
    artworkFallback: '#090D1D',
    artworkOverlay: 'rgba(2,5,17,0.30)',
    avatarFrame: '#070A18',
    avatarStroke: 'rgba(220,185,255,0.62)',
    composerDock: 'rgba(3,7,17,0.98)',
    composerInput: 'rgba(15,18,35,0.96)',
    composerStroke: 'rgba(176,155,255,0.16)',
    contextIcon: '#C981FF',
    deliveryRead: '#D693FF',
    filterSelectedShadow: '#B14CFF',
    filterUnreadDot: '#B55CFF',
    incomingBubble: 'rgba(15,20,39,0.96)',
    incomingStroke: 'rgba(205,213,244,0.12)',
    listCardSurface: 'rgba(7,10,24,0.94)',
    listCardStroke: 'rgba(176,155,255,0.18)',
    listCardReadStroke: 'rgba(176,155,255,0.10)',
    listCardUnreadStroke: 'rgba(205,173,255,0.38)',
    listCardFailureStroke: 'rgba(255,118,136,0.36)',
    listCardQueuedStroke: 'rgba(255,190,112,0.28)',
    listCardDraftStroke: 'rgba(255,190,112,0.16)',
    mutedSurface: 'rgba(8,12,26,0.72)',
    onlineFrame: '#070A18',
    sourceBannerSurface: 'rgba(12,13,34,0.96)',
    sourceBannerStroke: 'rgba(183,108,255,0.24)',
    timestamp: 'rgba(226,224,240,0.58)',
    unread: '#ED649D',
    wallpaperOverlay: 'rgba(3,7,17,0.50)',
    reportModal: {
      backdrop: 'rgba(0,0,0,0.70)',
      card: 'rgba(19, 15, 39, 0.97)',
      chevron: 'rgba(219,226,255,0.34)',
      eyebrow: 'rgba(255,188,203,0.62)',
      icon: 'rgba(255,188,203,0.84)',
      iconBorder: 'rgba(255,142,170,0.13)',
      iconSurface: 'rgba(255,116,150,0.08)',
    },
    optionsModal: {
      backdrop: 'rgba(2, 4, 12, 0.72)',
      card: 'rgba(13, 17, 34, 0.98)',
      chevron: 'rgba(210, 219, 245, 0.34)',
      closeBackground: 'rgba(145, 105, 255, 0.16)',
      closeBorder: 'rgba(194, 169, 255, 0.20)',
      closeText: '#EFEAFF',
      destructiveIcon: '#FFB4C2',
      destructiveIconBorder: 'rgba(255, 153, 180, 0.14)',
      destructiveIconSurface: 'rgba(180, 54, 89, 0.12)',
      destructiveText: '#FFD3DC',
      divider: 'rgba(214, 224, 255, 0.07)',
      handle: 'rgba(222, 214, 255, 0.24)',
      icon: 'rgba(220, 208, 255, 0.84)',
      iconBorder: 'rgba(190, 164, 255, 0.14)',
      iconSurface: 'rgba(122, 91, 210, 0.14)',
      label: '#F4F1FF',
      subtitle: 'rgba(207, 216, 241, 0.60)',
      optionSubtitle: 'rgba(207, 216, 241, 0.56)',
      title: '#FAF8FF',
    },
    chat: {
      ambientCyan: 'rgba(34,183,255,0.016)',
      ambientPurple: 'rgba(140,72,255,0.028)',
      avatarFallbackIcon: 'rgba(244,241,255,0.88)',
      avatarOnline: '#22DCA0',
      avatarOnlineFrame: 'rgba(5,9,21,0.96)',
      avatarShadow: '#B85DFF',
      avatarStroke: 'rgba(210,169,255,0.28)',
      buildActionIcon: 'rgba(194,170,255,0.84)',
      buildActionText: 'rgba(205,184,255,0.88)',
      buildEyebrow: 'rgba(137,205,232,0.66)',
      buildRoleStroke: 'rgba(118,209,236,0.24)',
      buildRoleSurface: 'rgba(6,11,25,0.82)',
      buildStroke: 'rgba(151,113,232,0.24)',
      buildSummary: 'rgba(196,207,232,0.58)',
      buildTagStroke: 'rgba(180,132,255,0.16)',
      buildTagSurface: 'rgba(137,89,220,0.10)',
      buildTagText: 'rgba(218,201,246,0.70)',
      buildTitle: 'rgba(247,248,255,0.94)',
      composerActionStroke: 'rgba(185,159,255,0.14)',
      composerActionSurface: 'rgba(118,92,205,0.12)',
      composerActionText: 'rgba(213,222,246,0.66)',
      composerDivider: 'rgba(210,224,255,0.04)',
      composerNoticeText: 'rgba(206,216,241,0.58)',
      deliveryDelivered: 'rgba(180,196,232,0.72)',
      deliveryFailed: 'rgba(255,139,150,0.88)',
      deliveryQueued: 'rgba(255,190,112,0.82)',
      deliveryRead: 'rgba(111,151,255,0.92)',
      deliverySent: 'rgba(198,208,235,0.54)',
      emojiSurface: 'rgba(255,255,255,0.035)',
      loadingOlderText: 'rgba(190,201,230,0.44)',
      mediaActionStroke: 'rgba(255,255,255,0.18)',
      mediaActionSurface: 'rgba(255,255,255,0.14)',
      mediaCaptionSurface: 'rgba(9,13,24,0.96)',
      mediaCaptionText: 'rgba(242,245,255,0.92)',
      mediaDeliveryTime: 'rgba(205,213,235,0.52)',
      mediaDurationSurface: 'rgba(0,0,0,0.58)',
      mediaFailedOverlay: 'rgba(30,4,10,0.66)',
      mediaFailedIcon: 'rgba(255,178,187,0.96)',
      mediaLoadingIcon: 'rgba(242,246,255,0.72)',
      mediaLoadingOverlay: 'rgba(4,8,16,0.18)',
      mediaMetaSurface: 'rgba(0,0,0,0.54)',
      mediaPreviewSurface: 'rgba(6,9,16,0.98)',
      mediaProgressValue: 'rgba(255,255,255,0.94)',
      mediaQueuedIcon: 'rgba(255,220,164,0.92)',
      mediaShellFailedStroke: 'rgba(255,118,136,0.34)',
      mediaShellShadow: '#6B76C8',
      mediaShellStroke: 'rgba(180,194,229,0.13)',
      mediaShellSurface: 'rgba(5,8,15,0.98)',
      mediaStateSurface: 'rgba(2,5,12,0.58)',
      mediaStateText: 'rgba(244,246,255,0.68)',
      mediaUnavailableIcon: 'rgba(235,241,255,0.82)',
      mediaPlayIcon: 'rgba(255,255,255,0.92)',
      mediaVideoSurface: 'rgba(24,29,48,0.94)',
      mutedMeta: 'rgba(198,208,235,0.48)',
      networkOfflineIcon: 'rgba(255,190,112,0.88)',
      networkSyncIcon: 'rgba(115,219,255,0.86)',
      networkStroke: 'rgba(255,187,104,0.12)',
      networkSurface: 'rgba(31,24,31,0.92)',
      networkText: 'rgba(228,220,222,0.72)',
      newMessageShadow: '#8B5CFF',
      newMessageStroke: 'rgba(221,207,255,0.20)',
      newMessageSurface: 'rgba(111,72,207,0.94)',
      onAccent: '#FFFFFF',
      outgoingFailedStroke: 'rgba(255,111,129,0.32)',
      outgoingFailureText: 'rgba(255,155,166,0.88)',
      outgoingTime: 'rgba(198,208,235,0.46)',
      readOnlyText: 'rgba(201,211,238,0.58)',
      relationshipStroke: 'rgba(204,151,255,0.16)',
      relationshipSurface: 'rgba(145,78,226,0.12)',
      relationshipText: 'rgba(218,189,255,0.78)',
      messageReport: 'rgba(255,179,198,0.68)',
      retryText: 'rgba(255,190,196,0.90)',
      selectedMediaPreviewSurface: 'rgba(5,8,16,0.92)',
      selectedMediaProcessingOverlay: 'rgba(0,0,0,0.44)',
      selectedMediaStroke: 'rgba(170,142,245,0.14)',
      selectedMediaSurface: 'rgba(13,19,36,0.74)',
      selectedMediaText: 'rgba(226,232,250,0.72)',
      softVioletSurface: 'rgba(111,91,196,0.16)',
      stateBackIcon: 'rgba(244,247,255,0.88)',
      stateDescription: 'rgba(190,201,230,0.54)',
      stateIcon: 'rgba(205,184,255,0.72)',
      stateRetryStroke: 'rgba(210,179,255,0.2)',
      stateRetrySurface: 'rgba(139,83,220,0.18)',
      stateRetryText: 'rgba(238,230,255,0.86)',
      statusText: 'rgba(190,201,230,0.52)',
      teamActionStroke: 'rgba(199,160,255,0.24)',
      teamInviteStroke: 'rgba(160,116,235,0.26)',
      teamCountStroke: 'rgba(184,151,255,0.22)',
      teamCountText: 'rgba(221,207,255,0.78)',
      teamEmblemStroke: 'rgba(206,144,255,0.42)',
      teamGlow: 'rgba(146,63,255,0.08)',
      teamMembers: 'rgba(194,205,233,0.58)',
      teamNeedIcon: 'rgba(255,177,105,0.88)',
      teamNeedStroke: 'rgba(255,154,84,0.18)',
      teamNeedSurface: 'rgba(255,133,58,0.09)',
      teamNeedText: 'rgba(255,181,120,0.88)',
      teamTitle: 'rgba(247,248,255,0.96)',
      timelineDot: 'rgba(188,199,227,0.18)',
      timelineGapText: 'rgba(188,199,227,0.38)',
      timelineLabel: 'rgba(184,195,224,0.46)',
      timelineRule: 'rgba(205,217,246,0.055)',
      timelineTimestamp: 'rgba(190,200,228,0.40)',
      typingDot: 'rgba(151,94,255,0.82)',
      typingStroke: 'rgba(207,220,255,0.08)',
      typingSurface: 'rgba(15,21,39,0.80)',
      unreadRule: 'rgba(167,118,255,0.32)',
      unreadText: 'rgba(207,181,255,0.82)',
    },
  },
  gradients: {
    avatarRing: appGradients.profileRing,
    chat: {
      avatarFallback: [
        'rgba(123,66,216,0.76)',
        'rgba(30,111,166,0.52)',
      ] as const,
      buildCard: [
        'rgba(35,25,68,0.96)',
        'rgba(12,21,42,0.98)',
        'rgba(10,42,61,0.92)',
      ] as const,
      buildPreviewFade: ['transparent', 'rgba(6,10,22,0.88)'] as const,
      viewportTopScrim: ['rgba(3,7,17,0.98)', 'rgba(3,7,17,0)'] as const,
      teamAction: ['rgba(137,70,232,0.94)', 'rgba(64,92,185,0.90)'] as const,
      teamInvite: [
        'rgba(31,20,62,0.96)',
        'rgba(13,20,40,0.98)',
        'rgba(9,38,56,0.92)',
      ] as const,
    },
    cardScrim: [
      'rgba(3,7,17,0.98)',
      'rgba(5,8,24,0.88)',
      'rgba(5,7,21,0.52)',
      'rgba(4,7,20,0.10)',
    ] as const,
    cardTrailingScrim: [
      'rgba(4,7,20,0)',
      'rgba(4,7,20,0.18)',
      'rgba(3,7,17,0.82)',
    ] as const,
    filterSelected: ['#723DFF', '#C247DE', '#ED649D'] as const,
    eventBannerScrim: [
      'rgba(3,7,17,0.06)',
      'rgba(5,8,24,0.72)',
      'rgba(3,7,17,0.96)',
    ] as const,
    outgoingBubble: ['#7449E9', '#B34FFF', '#ED649D'] as const,
    send: appGradients.primaryOrb,
    wallpaperScrim: [
      'rgba(3,7,17,0.72)',
      'rgba(3,7,17,0.34)',
      'rgba(3,7,17,0.70)',
    ] as const,
  },
  metrics: {
    chat: {
      composerControl: 48,
      composerControlCompact: 44,
      composerMinHeight: 62,
      eventBannerHeight: 76,
      eventBannerRadius: appRadii['2xl'],
      headerAvatar: 48,
      headerAvatarCompact: 44,
      headerMinHeight: 70,
      incomingBubbleRadius: appRadii.xl,
      outgoingBubbleRadius: appRadii.xl,
    },
    inbox: {
      avatar: 52,
      avatarCompact: 48,
      cardMinHeight: 96,
      cardMinHeightCompact: 90,
      cardRadius: appRadii['3xl'],
      cardRadiusCompact: appRadii['2xl'],
      filterHeight: 32,
      filterPaddingHorizontal: appSpacing['2xl'],
      searchHeight: 46,
    },
  },
} as const;

export type MessageInboxCardVisual = Readonly<{
  borderColor: string;
  emphasis: 'none' | 'low';
  frameGradient: readonly [string, string];
  withShadow: false;
}>;

/** Maps the authoritative attention state to one restrained inbox-card treatment. */
export function resolveMessageInboxCardVisual(
  state: MessageInboxAttentionState,
): MessageInboxCardVisual {
  const quietStroke = messagesUi.colors.listCardReadStroke;
  const quietFrame = [quietStroke, quietStroke] as const;

  switch (state) {
    case 'unread':
      return {
        borderColor: messagesUi.colors.listCardUnreadStroke,
        emphasis: 'low',
        frameGradient: [
          messagesUi.colors.listCardUnreadStroke,
          messagesUi.colors.listCardStroke,
        ],
        withShadow: false,
      };
    case 'failed':
      return {
        borderColor: messagesUi.colors.listCardFailureStroke,
        emphasis: 'none',
        frameGradient: [messagesUi.colors.listCardFailureStroke, quietStroke],
        withShadow: false,
      };
    case 'queued':
      return {
        borderColor: messagesUi.colors.listCardQueuedStroke,
        emphasis: 'none',
        frameGradient: [messagesUi.colors.listCardQueuedStroke, quietStroke],
        withShadow: false,
      };
    case 'draft':
      return {
        borderColor: messagesUi.colors.listCardDraftStroke,
        emphasis: 'none',
        frameGradient: [messagesUi.colors.listCardDraftStroke, quietStroke],
        withShadow: false,
      };
    case 'sending':
    case 'normal':
      return {
        borderColor: quietStroke,
        emphasis: 'none',
        frameGradient: quietFrame,
        withShadow: false,
      };
    default: {
      const unsupportedState: never = state;
      throw new Error(
        `Unsupported message inbox attention state: ${String(unsupportedState)}`,
      );
    }
  }
}
