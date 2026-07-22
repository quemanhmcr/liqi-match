/**
 * Public UI API extracted from the approved Home and Messages surfaces.
 * Feature-specific recipes stay in their owning feature; this package exposes
 * only semantic typography and reusable interaction/surface contracts.
 */
export { AppActionDock, type AppActionDockProps } from './AppActionDock';
export { AppBackground } from './AppBackground';
export { AppButton, type AppButtonProps } from './AppButton';
export { AppCard, type AppCardProps } from './AppCard';
export { AppChip, type AppChipProps } from './AppChip';
export {
  AppIdentityHeader,
  appDaypartCopy,
  appDisplayFirstName,
  type AppIdentityHeaderAction,
  type AppIdentityHeaderProps,
} from './AppIdentityHeader';
export { AppIconButton, type AppIconButtonProps } from './AppIconButton';
export {
  AppNotice,
  type AppNoticeProps,
  type AppNoticeTone,
} from './AppNotice';
export {
  AppPressableCard,
  type AppPressableCardProps,
} from './AppPressableCard';
export { AppScreen, type AppScreenProps } from './AppScreen';
export {
  AppSectionHeader,
  type AppSectionHeaderProps,
} from './AppSectionHeader';
export {
  AppSurface,
  type AppSurfaceEmphasis,
  type AppSurfaceProps,
  type AppSurfaceTone,
  type AppSurfaceVariant,
} from './AppSurface';
export { AppTextField, type AppTextFieldProps } from './AppTextField';
export {
  AppText,
  type AppTextProps,
  type AppTextTone,
  type AppTextVariant,
} from './AppText';
export {
  appBreakpoints,
  appColors,
  appGradients,
  appMotion,
  appOpacity,
  appRadii,
  appShadows,
  appSpacing,
  appTouch,
  appTypography,
  appUiVersion,
  isCompactViewport,
} from './theme/app-theme';
