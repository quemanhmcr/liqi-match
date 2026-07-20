import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type TextProps,
} from 'react-native';

import { LiqiButton, LiqiCard } from '@/shared/components/liqi';
import { liqiColors } from '@/shared/theme/liqi-design-system';

import { DiscoverResolvedImage } from './DiscoverResolvedImage';
import type {
  DiscoverResolvedMedia,
  DiscoverSetCard as DiscoverSetCardData,
} from '../model/discover-domain';
import { useDiscoverStore } from '../model/discover-store';
import { useRequestSetJoinMutation } from '../queries/discover-queries';

type DiscoverSetCardProps = {
  card: DiscoverSetCardData;
  compact: boolean;
  inset?: boolean;
  presentation?: 'list' | 'preview';
};

type DiscoverTextProps = TextProps;
type Tone = 'cyan' | 'orange';

const toneColors: Record<
  Tone,
  { background: string; border: string; text: string }
> = {
  cyan: {
    background: 'rgba(41,183,255,0.13)',
    border: 'rgba(92,220,255,0.28)',
    text: '#85E8FF',
  },
  orange: {
    background: 'rgba(255,133,46,0.12)',
    border: 'rgba(255,160,82,0.24)',
    text: '#FFB36C',
  },
};

function DiscoverText(props: DiscoverTextProps) {
  return <RNText maxFontSizeMultiplier={1} {...props} />;
}

export function DiscoverSetCard({
  card,
  compact,
  inset = true,
  presentation = 'preview',
}: DiscoverSetCardProps) {
  const selected = useDiscoverStore((state) => state.selectedSetId === card.id);
  const openSet = useDiscoverStore((state) => state.openSet);
  const requestMutation = useRequestSetJoinMutation();
  const requesting =
    requestMutation.isPending && requestMutation.variables?.setId === card.id;
  const requested = card.actionState === 'pending' || requesting;
  const listPresentation = presentation === 'list';
  const visibleTagCount = listPresentation ? 2 : compact ? 3 : 4;
  const visibleTags = card.tags.slice(0, visibleTagCount);
  const hiddenTagCount = Math.max(card.tags.length - visibleTags.length, 0);
  const memberSurplusCount = Math.max(card.avatarSources.length - 3, 0);
  const memberSurplus = memberSurplusCount
    ? `+${memberSurplusCount}`
    : undefined;
  const actionText =
    card.actionKind === 'request'
      ? requested
        ? 'Đã gửi'
        : card.actionLabel
      : card.actionLabel;

  const onAction = () => {
    if (card.actionKind === 'request') {
      requestMutation.mutate({ setId: card.id, version: card.version });
      return;
    }
    openSet(card.id);
  };

  return (
    <View
      style={inset ? styles.insetCard : undefined}
      testID={`discover-set-card-${card.id}`}
    >
      <LiqiCard
        borderOpacity={listPresentation ? 0.16 : 0.14}
        contentStyle={[
          styles.cardContent,
          compact && styles.cardContentCompact,
          listPresentation && styles.cardContentList,
        ]}
        density="compact"
        emphasis={
          listPresentation
            ? 'low'
            : card.actionTone === 'cyan'
              ? 'low'
              : 'medium'
        }
        radius={listPresentation ? 25 : 23}
        style={selected ? styles.cardSelected : undefined}
        backgroundColor={
          card.actionTone === 'cyan'
            ? 'rgba(8,23,42,0.62)'
            : 'rgba(16,14,36,0.64)'
        }
        variant={card.actionTone}
        withHighlight={false}
        withShadow={false}
      >
        {listPresentation ? (
          <View testID={`discover-set-list-layout-${card.id}`}>
            <Pressable
              accessibilityLabel={`Mở chi tiết ${card.title}`}
              accessibilityRole="button"
              onPress={() => openSet(card.id)}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <View style={styles.listTopRow}>
                <SetImage card={card} listPresentation />
                <View style={styles.body}>
                  <View style={styles.titleRow}>
                    <DiscoverText
                      numberOfLines={2}
                      style={[styles.title, styles.titleList]}
                    >
                      {card.title}
                    </DiscoverText>
                    <ToneBadge label={card.badgeLabel} tone={card.badgeTone} />
                  </View>
                  <SetMeta card={card} />
                </View>
              </View>

              <View
                style={styles.listTagRow}
                testID={`discover-set-list-tags-${card.id}`}
              >
                {visibleTags.map((tag) => (
                  <TinyTag key={tag} label={tag} list tone={card.badgeTone} />
                ))}
                {hiddenTagCount ? (
                  <View
                    accessibilityLabel={`${hiddenTagCount} thẻ khác`}
                    style={styles.hiddenTagCount}
                  >
                    <DiscoverText style={styles.hiddenTagCountText}>
                      +{hiddenTagCount} khác
                    </DiscoverText>
                  </View>
                ) : null}
              </View>
            </Pressable>

            <View
              style={styles.listFooter}
              testID={`discover-set-list-footer-${card.id}`}
            >
              <AvatarStack
                sources={card.avatarSources.slice(0, 3)}
                surplus={memberSurplus}
              />
              <SetAction
                actionText={actionText}
                card={card}
                listPresentation
                onPress={onAction}
                requested={requested}
              />
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            <SetImage card={card} />
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <DiscoverText
                  numberOfLines={compact ? 2 : 1}
                  style={styles.title}
                >
                  {card.title}
                </DiscoverText>
                <ToneBadge label={card.badgeLabel} tone={card.badgeTone} />
              </View>
              <SetMeta card={card} />
              <View style={styles.tagRow}>
                {visibleTags.map((tag) => (
                  <TinyTag key={tag} label={tag} tone={card.badgeTone} />
                ))}
              </View>
            </View>
            <View style={styles.trailing}>
              <AvatarStack
                sources={card.avatarSources.slice(0, 3)}
                surplus={memberSurplus}
              />
              <SetAction
                actionText={actionText}
                card={card}
                onPress={onAction}
                requested={requested}
              />
            </View>
          </View>
        )}
      </LiqiCard>
    </View>
  );
}

function SetImage({
  card,
  listPresentation = false,
}: {
  card: DiscoverSetCardData;
  listPresentation?: boolean;
}) {
  return (
    <View
      style={[styles.imageShell, listPresentation && styles.imageShellList]}
    >
      <DiscoverResolvedImage
        media={card.image}
        resizeMode="cover"
        style={styles.image}
      />
    </View>
  );
}

function SetMeta({ card }: { card: DiscoverSetCardData }) {
  return (
    <View style={styles.metaRow}>
      <DiscoverText numberOfLines={1} style={styles.meta}>
        {card.meta}
      </DiscoverText>
      <DiscoverText style={styles.metaDot}>·</DiscoverText>
      <DiscoverText style={styles.meta}>{card.slots}</DiscoverText>
      <DiscoverText style={styles.metaDot}>·</DiscoverText>
      {card.statusKind === 'mic' ? (
        <Ionicons color="#4EF2C7" name="mic" size={12} />
      ) : (
        <View style={styles.onlineDot} />
      )}
      <DiscoverText style={styles.statusText}>{card.statusLabel}</DiscoverText>
    </View>
  );
}

function SetAction({
  actionText,
  card,
  listPresentation = false,
  onPress,
  requested,
}: {
  actionText: string;
  card: DiscoverSetCardData;
  listPresentation?: boolean;
  onPress: () => void;
  requested: boolean;
}) {
  return (
    <LiqiButton
      accessibilityLabel={`${card.actionLabel} ${card.title}`}
      contentStyle={[
        styles.buttonContent,
        listPresentation && styles.buttonContentList,
      ]}
      disabled={card.actionKind === 'request' && requested}
      emphasis={card.actionKind === 'view' ? 'none' : 'low'}
      onPress={onPress}
      radius={listPresentation ? 18 : 17}
      style={[styles.actionButton, listPresentation && styles.actionButtonList]}
      variant={
        card.actionKind === 'view'
          ? 'secondary'
          : card.actionTone === 'cyan'
            ? 'rank'
            : 'primary'
      }
      withShadow={false}
    >
      <DiscoverText
        numberOfLines={1}
        style={[styles.buttonText, listPresentation && styles.buttonTextList]}
      >
        {actionText}
      </DiscoverText>
    </LiqiButton>
  );
}

function ToneBadge({ label, tone }: { label: string; tone: Tone }) {
  const resolved = toneColors[tone];
  return (
    <View
      style={[
        styles.toneBadge,
        { backgroundColor: resolved.background, borderColor: resolved.border },
      ]}
    >
      <Ionicons
        color={resolved.text}
        name={tone === 'orange' ? 'people-outline' : 'trophy-outline'}
        size={11}
      />
      <DiscoverText style={[styles.toneBadgeText, { color: resolved.text }]}>
        {label}
      </DiscoverText>
    </View>
  );
}

function TinyTag({
  label,
  list = false,
  tone,
}: {
  label: string;
  list?: boolean;
  tone: Tone;
}) {
  const resolved = toneColors[tone];
  return (
    <View
      style={[
        styles.tinyTag,
        list && styles.tinyTagList,
        { backgroundColor: resolved.background, borderColor: resolved.border },
      ]}
    >
      <DiscoverText
        numberOfLines={1}
        style={[styles.tinyTagText, { color: resolved.text }]}
      >
        {label}
      </DiscoverText>
    </View>
  );
}

function AvatarStack({
  sources,
  surplus,
}: {
  sources: readonly DiscoverResolvedMedia[];
  surplus?: string;
}) {
  return (
    <View style={styles.avatarStack}>
      {sources.map((source, index) => (
        <DiscoverResolvedImage
          key={index}
          media={source}
          style={[styles.stackAvatar, index > 0 && styles.stackAvatarOverlap]}
        />
      ))}
      {surplus ? (
        <View style={styles.stackSurplus}>
          <DiscoverText style={styles.stackSurplusText}>{surplus}</DiscoverText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: { minWidth: 70 },
  actionButtonList: { minWidth: 88 },
  avatarStack: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  body: { flex: 1, minWidth: 0 },
  buttonContent: {
    minHeight: 27,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
  },
  buttonContentList: {
    minHeight: 31,
    paddingHorizontal: 12,
    paddingVertical: 3.5,
  },
  buttonText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' },
  buttonTextList: { fontSize: 11.5 },
  cardContent: {
    minHeight: 98,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  cardContentCompact: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  cardContentList: {
    minHeight: 126,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  cardSelected: {
    opacity: 0.98,
    transform: [{ scale: 0.997 }],
  },
  hiddenTagCount: {
    alignItems: 'center',
    backgroundColor: 'rgba(43,48,75,0.72)',
    borderColor: 'rgba(222,229,250,0.14)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 23,
    paddingHorizontal: 8,
  },
  hiddenTagCountText: {
    color: 'rgba(224,229,247,0.74)',
    fontSize: 10,
    fontWeight: '800',
  },
  image: { height: '100%', width: '100%' },
  imageShell: {
    borderColor: 'rgba(212,223,255,0.20)',
    borderRadius: 999,
    borderWidth: 1,
    height: 46,
    overflow: 'hidden',
    width: 46,
  },
  imageShellList: { height: 52, width: 52 },
  insetCard: { marginHorizontal: 18 },
  listFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    minHeight: 31,
  },
  listTagRow: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 62,
    marginTop: 6,
    minHeight: 22,
    overflow: 'hidden',
  },
  listTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  meta: {
    color: liqiColors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  metaDot: { color: liqiColors.text.muted, fontSize: 12 },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  onlineDot: {
    backgroundColor: '#35E8B5',
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  stackAvatar: {
    borderColor: 'rgba(245,248,255,0.62)',
    borderRadius: 999,
    borderWidth: 1.2,
    height: 24,
    width: 24,
  },
  stackAvatarOverlap: { marginLeft: -7 },
  stackSurplus: {
    alignItems: 'center',
    backgroundColor: 'rgba(31,36,62,0.86)',
    borderColor: 'rgba(220,228,255,0.16)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: 'center',
    marginLeft: -6,
    minWidth: 31,
    paddingHorizontal: 7,
  },
  stackSurplusText: {
    color: liqiColors.text.secondary,
    fontSize: 9.5,
    fontWeight: '800',
  },
  statusText: {
    color: 'rgba(112,244,208,0.88)',
    fontSize: 11,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 7,
    minWidth: 0,
    overflow: 'hidden',
  },
  tinyTag: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
    maxWidth: 92,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  tinyTagList: {
    flexShrink: 0,
    maxWidth: 110,
    paddingHorizontal: 8,
  },
  tinyTagText: { fontSize: 9.5, fontWeight: '700' },
  title: {
    color: liqiColors.text.primary,
    flex: 1,
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: -0.28,
    lineHeight: 15,
  },
  titleList: { fontSize: 15.5, lineHeight: 18 },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    minWidth: 0,
  },
  toneBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 3,
    minHeight: 18,
    paddingHorizontal: 6,
  },
  toneBadgeText: { fontSize: 8.5, fontWeight: '800' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.995 }] },
  trailing: {
    alignItems: 'flex-end',
    gap: 5,
    minWidth: 62,
  },
});
