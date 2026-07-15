import type { AuthSession } from '@/shared/auth/auth-service';
import type {
  PlayerPrivacySettingsV2,
  ReportCategoryV2,
} from '@/shared/contracts/core-v2';

import { SocialCommandJournal } from './social-command-journal';
import {
  emitSocialTelemetry,
  socialTelemetryErrorAttributes,
  type SocialCommandOperation,
} from './social-telemetry';
import type {
  PlayerPrivacyProvider,
  PlayerSafetyCommandService,
  SocialRelationshipCommandService,
} from './social-relationship-repository';

export class SocialCommandCoordinator {
  constructor(
    private readonly services: Readonly<{
      friendship: SocialRelationshipCommandService;
      privacy: PlayerPrivacyProvider;
      safety: PlayerSafetyCommandService;
    }>,
    private readonly journal = new SocialCommandJournal(),
  ) {}

  async requestFriendship(input: {
    expectedRelationshipVersion: number;
    session: AuthSession;
    targetPlayerId: string;
  }) {
    return this.execute('request_friendship', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.requestFriendship({
        accountId,
        expectedRelationshipVersion: input.expectedRelationshipVersion,
        targetPlayerId: input.targetPlayerId,
      });
      const receipt = await this.services.friendship.requestFriendship(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        input.targetPlayerId,
        'request-friendship',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async acceptFriendship(input: {
    expectedRelationshipVersion: number;
    expectedRequestVersion: number;
    friendshipRequestId: string;
    session: AuthSession;
  }) {
    return this.execute('accept_friendship', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.acceptFriendship({
        accountId,
        expectedRelationshipVersion: input.expectedRelationshipVersion,
        expectedRequestVersion: input.expectedRequestVersion,
        friendshipRequestId: input.friendshipRequestId,
      });
      const receipt = await this.services.friendship.acceptFriendship(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        input.friendshipRequestId,
        'accept-friendship',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async declineFriendship(input: {
    expectedRelationshipVersion: number;
    expectedRequestVersion: number;
    friendshipRequestId: string;
    session: AuthSession;
  }) {
    return this.execute('decline_friendship', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.declineFriendship({
        accountId,
        expectedRelationshipVersion: input.expectedRelationshipVersion,
        expectedRequestVersion: input.expectedRequestVersion,
        friendshipRequestId: input.friendshipRequestId,
      });
      const receipt = await this.services.friendship.declineFriendship(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        input.friendshipRequestId,
        'decline-friendship',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async cancelFriendship(input: {
    expectedRelationshipVersion: number;
    expectedRequestVersion: number;
    friendshipRequestId: string;
    session: AuthSession;
  }) {
    return this.execute('cancel_friendship', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.cancelFriendship({
        accountId,
        expectedRelationshipVersion: input.expectedRelationshipVersion,
        expectedRequestVersion: input.expectedRequestVersion,
        friendshipRequestId: input.friendshipRequestId,
      });
      const receipt = await this.services.friendship.cancelFriendship(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        input.friendshipRequestId,
        'cancel-friendship',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async removeFriendship(input: {
    expectedRelationshipVersion: number;
    session: AuthSession;
    targetPlayerId: string;
  }) {
    return this.execute('remove_friendship', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.removeFriendship({
        accountId,
        expectedRelationshipVersion: input.expectedRelationshipVersion,
        targetPlayerId: input.targetPlayerId,
      });
      const receipt = await this.services.friendship.removeFriendship(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        input.targetPlayerId,
        'remove-friendship',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async blockPlayer(input: {
    expectedRelationshipVersion: number;
    reasonCode?: string | null;
    session: AuthSession;
    targetPlayerId: string;
  }) {
    return this.execute('block_player', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.blockPlayer({
        accountId,
        expectedRelationshipVersion: input.expectedRelationshipVersion,
        reasonCode: input.reasonCode ?? null,
        targetPlayerId: input.targetPlayerId,
      });
      const receipt = await this.services.safety.blockPlayer(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        input.targetPlayerId,
        'block-player',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async unblockPlayer(input: {
    expectedRelationshipVersion: number;
    session: AuthSession;
    targetPlayerId: string;
  }) {
    return this.execute('unblock_player', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.unblockPlayer({
        accountId,
        expectedRelationshipVersion: input.expectedRelationshipVersion,
        targetPlayerId: input.targetPlayerId,
      });
      const receipt = await this.services.safety.unblockPlayer(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        input.targetPlayerId,
        'unblock-player',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async mutePlayer(input: {
    expectedRelationshipVersion: number;
    session: AuthSession;
    targetPlayerId: string;
  }) {
    return this.execute('mute_player', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.mutePlayer({
        accountId,
        expectedRelationshipVersion: input.expectedRelationshipVersion,
        targetPlayerId: input.targetPlayerId,
      });
      const receipt = await this.services.safety.mutePlayer(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        input.targetPlayerId,
        'mute-player',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async unmutePlayer(input: {
    expectedRelationshipVersion: number;
    session: AuthSession;
    targetPlayerId: string;
  }) {
    return this.execute('unmute_player', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.unmutePlayer({
        accountId,
        expectedRelationshipVersion: input.expectedRelationshipVersion,
        targetPlayerId: input.targetPlayerId,
      });
      const receipt = await this.services.safety.unmutePlayer(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        input.targetPlayerId,
        'unmute-player',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async updatePrivacy(input: {
    expectedPrivacyVersion: number;
    privacy: Omit<
      PlayerPrivacySettingsV2,
      'contractVersion' | 'playerId' | 'updatedAt' | 'version'
    >;
    session: AuthSession;
  }) {
    return this.execute('update_privacy', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.updatePrivacy({
        accountId,
        expectedPrivacyVersion: input.expectedPrivacyVersion,
        ...input.privacy,
      });
      const receipt = await this.services.privacy.updatePrivacy(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        'self',
        'update-privacy',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async reportPlayer(input: {
    category: ReportCategoryV2;
    details: string | null;
    session: AuthSession;
    targetPlayerId: string;
  }) {
    return this.execute('report_player', async () => {
      const accountId = canonicalAccountId(input.session);
      const command = await this.journal.reportPlayer({
        accountId,
        category: input.category,
        details: input.details,
        targetPlayerId: input.targetPlayerId,
      });
      const receipt = await this.services.safety.reportPlayer(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        input.targetPlayerId,
        'report-player',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  async reportMessage(input: {
    category: ReportCategoryV2;
    conversationId: string;
    details: string | null;
    messageId: string;
    session: AuthSession;
    targetPlayerId: string;
  }) {
    return this.execute('report_message', async () => {
      const accountId = canonicalAccountId(input.session);
      const identity = `${input.conversationId}:${input.messageId}`;
      const command = await this.journal.reportMessage({
        accountId,
        category: input.category,
        conversationId: input.conversationId,
        details: input.details,
        messageId: input.messageId,
        targetPlayerId: input.targetPlayerId,
      });
      const receipt = await this.services.safety.reportMessage(
        input.session,
        command,
      );
      await this.complete(
        accountId,
        identity,
        'report-message',
        command.idempotencyKey,
      );
      return receipt;
    });
  }

  private async execute<T>(
    operation: SocialCommandOperation,
    action: () => Promise<T>,
  ): Promise<T> {
    emitSocialTelemetry('social.command.started', { operation });
    try {
      const result = await action();
      emitSocialTelemetry(
        'social.command.succeeded',
        socialSuccessAttributes(operation, result),
      );
      return result;
    } catch (error) {
      emitSocialTelemetry('social.command.failed', {
        operation,
        ...socialTelemetryErrorAttributes(error),
      });
      throw error;
    }
  }

  private complete(
    accountId: string,
    identity: string,
    operation: Parameters<SocialCommandJournal['complete']>[0]['operation'],
    idempotencyKey: string,
  ) {
    return this.journal.complete({
      accountId,
      identity,
      idempotencyKey,
      operation,
    });
  }
}

function socialSuccessAttributes(
  operation: SocialCommandOperation,
  result: unknown,
) {
  const receipt =
    result && typeof result === 'object'
      ? (result as {
          correlationId?: unknown;
          privacy?: { version?: unknown };
          relationship?: { version?: unknown };
          repeated?: unknown;
          version?: unknown;
        })
      : null;
  const aggregateVersion =
    typeof receipt?.relationship?.version === 'number'
      ? receipt.relationship.version
      : typeof receipt?.privacy?.version === 'number'
        ? receipt.privacy.version
        : typeof receipt?.version === 'number'
          ? receipt.version
          : undefined;
  return {
    operation,
    repeated: receipt?.repeated === true,
    ...(typeof receipt?.correlationId === 'string'
      ? { correlationId: receipt.correlationId }
      : {}),
    ...(aggregateVersion === undefined ? {} : { aggregateVersion }),
  };
}

function canonicalAccountId(session: AuthSession) {
  const accountId = session.principal?.accountId;
  if (!accountId || accountId !== session.user.id) {
    throw Object.assign(
      new Error('Session does not contain a canonical account identity.'),
      { code: 'relationship_identity_mismatch', retryable: false },
    );
  }
  return accountId;
}
