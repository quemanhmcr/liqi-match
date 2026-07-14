import { z } from 'zod';

export const SetInviteV2IdSchema = z.string().uuid().brand<'SetInviteV2Id'>();
export type SetInviteV2Id = z.infer<typeof SetInviteV2IdSchema>;

export const SetJoinRequestV2IdSchema = z
  .string()
  .uuid()
  .brand<'SetJoinRequestV2Id'>();
export type SetJoinRequestV2Id = z.infer<typeof SetJoinRequestV2IdSchema>;

export const SessionInviteV2IdSchema = z
  .string()
  .uuid()
  .brand<'SessionInviteV2Id'>();
export type SessionInviteV2Id = z.infer<typeof SessionInviteV2IdSchema>;

export const SessionRoleAssignmentV2IdSchema = z
  .string()
  .uuid()
  .brand<'SessionRoleAssignmentV2Id'>();
export type SessionRoleAssignmentV2Id = z.infer<
  typeof SessionRoleAssignmentV2IdSchema
>;

export const SessionReadyCheckV2IdSchema = z
  .string()
  .uuid()
  .brand<'SessionReadyCheckV2Id'>();
export type SessionReadyCheckV2Id = z.infer<typeof SessionReadyCheckV2IdSchema>;

export const SessionCompletionClaimV2IdSchema = z
  .string()
  .uuid()
  .brand<'SessionCompletionClaimV2Id'>();
export type SessionCompletionClaimV2Id = z.infer<
  typeof SessionCompletionClaimV2IdSchema
>;
