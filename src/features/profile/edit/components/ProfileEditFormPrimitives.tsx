import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';

import { AppCard, AppChip, AppText, appColors } from '@/shared/ui';

import { profileEditUi } from '../../ui/profile-edit-ui';
import { profileEditExperienceStyles as styles } from './profile-edit-experience.styles';

export function EditPanel({
  children,
  description,
  icon,
  title,
}: Readonly<{
  children: ReactNode;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}>) {
  return (
    <AppCard
      backgroundColor={profileEditUi.colors.panel}
      contentStyle={styles.panelContent}
      radius={profileEditUi.radii.panel}
      withShadow={false}
    >
      <View style={styles.panelHeader}>
        <View style={styles.panelIcon}>
          <Ionicons color={appColors.accent.purpleIcon} name={icon} size={19} />
        </View>
        <View style={styles.panelTitleBlock}>
          <AppText variant="h2">{title}</AppText>
          <AppText tone="secondary" variant="bodySmall">
            {description}
          </AppText>
        </View>
      </View>
      {children}
    </AppCard>
  );
}

export function FieldLabel({ label, meta }: { label: string; meta?: string }) {
  return (
    <View style={styles.fieldLabelRow}>
      <AppText variant="label">{label}</AppText>
      {meta ? (
        <AppText tone="muted" variant="caption">
          {meta}
        </AppText>
      ) : null}
    </View>
  );
}

type CatalogOption<Id extends string | number> = Readonly<{
  id: Id;
  label: string;
}>;

export function SingleOptionGroup<Id extends string | number>({
  disabled = false,
  label,
  onSelect,
  options,
  selectedId,
}: Readonly<{
  disabled?: boolean;
  label: string;
  onSelect: (id: Id) => void;
  options: readonly CatalogOption<Id>[];
  selectedId: Id | null;
}>) {
  return (
    <View>
      <FieldLabel label={label} />
      <OptionWrap>
        {options.map((option) => (
          <AppChip
            accessibilityLabel={`${label} ${option.label}`}
            accessibilityState={{ selected: selectedId === option.id }}
            density="compact"
            withSheen={false}
            disabled={disabled}
            key={option.id}
            onPress={() => onSelect(option.id)}
            selected={selectedId === option.id}
            variant="purple"
          >
            {option.label}
          </AppChip>
        ))}
      </OptionWrap>
    </View>
  );
}

export function MultiOptionGroup<Id extends string | number>({
  label,
  limit,
  onLimitReached,
  onToggle,
  options,
  selectedIds,
}: Readonly<{
  label: string;
  limit: number;
  onLimitReached?: () => void;
  onToggle: (ids: Id[]) => void;
  options: readonly CatalogOption<Id>[];
  selectedIds: readonly Id[];
}>) {
  return (
    <View>
      <FieldLabel label={label} meta={`${selectedIds.length}/${limit}`} />
      <OptionWrap>
        {options.map((option) => {
          const selected = selectedIds.includes(option.id);
          return (
            <AppChip
              accessibilityLabel={`${label} ${option.label}`}
              accessibilityState={{ selected }}
              density="compact"
              withSheen={false}
              key={option.id}
              onPress={() => {
                if (selected) {
                  onToggle(selectedIds.filter((id) => id !== option.id));
                  return;
                }
                if (selectedIds.length >= limit) {
                  onLimitReached?.();
                  return;
                }
                onToggle([...selectedIds, option.id]);
              }}
              selected={selected}
              variant="purple"
            >
              {option.label}
            </AppChip>
          );
        })}
      </OptionWrap>
    </View>
  );
}

export function OptionWrap({ children }: { children: ReactNode }) {
  return <View style={styles.optionWrap}>{children}</View>;
}

export function Subsection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.subsection}>
      <AppText tone="accent" variant="label">
        {title.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function ProfileEditAvatar({
  displayName,
  size,
  uri,
}: Readonly<{ displayName: string; size: number; uri?: string }>) {
  return (
    <LinearGradient
      colors={profileEditUi.gradients.avatarRing}
      style={[
        styles.avatarRing,
        { borderRadius: size / 2 + 3, height: size + 6, width: size + 6 },
      ]}
    >
      <View
        style={[
          styles.avatarInner,
          { borderRadius: size / 2, height: size, width: size },
        ]}
      >
        {uri ? (
          <Image
            resizeMode="cover"
            source={{ uri }}
            style={[styles.fill, { borderRadius: size / 2 }]}
          />
        ) : (
          <AppText variant="h1">
            {displayName.trim().charAt(0).toUpperCase() || 'L'}
          </AppText>
        )}
      </View>
    </LinearGradient>
  );
}
