import { z } from 'zod';

export const SocialRelationshipIdV2Schema = z
  .string()
  .uuid()
  .brand<'SocialRelationshipIdV2'>();
export const FriendshipRequestIdV2Schema = z
  .string()
  .uuid()
  .brand<'FriendshipRequestIdV2'>();
export const PlayerBlockIdV2Schema = z
  .string()
  .uuid()
  .brand<'PlayerBlockIdV2'>();
export const PlayerMuteIdV2Schema = z.string().uuid().brand<'PlayerMuteIdV2'>();
export const PlayerPrivacySettingsIdV2Schema = z
  .string()
  .uuid()
  .brand<'PlayerPrivacySettingsIdV2'>();
export const ReportIdV2Schema = z.string().uuid().brand<'ReportIdV2'>();
export const ReportEvidenceIdV2Schema = z
  .string()
  .uuid()
  .brand<'ReportEvidenceIdV2'>();

export type SocialRelationshipIdV2 = z.infer<
  typeof SocialRelationshipIdV2Schema
>;
export type FriendshipRequestIdV2 = z.infer<typeof FriendshipRequestIdV2Schema>;
export type PlayerBlockIdV2 = z.infer<typeof PlayerBlockIdV2Schema>;
export type PlayerMuteIdV2 = z.infer<typeof PlayerMuteIdV2Schema>;
export type PlayerPrivacySettingsIdV2 = z.infer<
  typeof PlayerPrivacySettingsIdV2Schema
>;
export type ReportIdV2 = z.infer<typeof ReportIdV2Schema>;
export type ReportEvidenceIdV2 = z.infer<typeof ReportEvidenceIdV2Schema>;
