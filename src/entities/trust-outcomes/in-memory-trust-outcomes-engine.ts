import {
  ActivityItemV2Schema,
  ConfirmSessionParticipationCommandV2Schema,
  DisputeSessionParticipationCommandV2Schema,
  DismissActivityItemCommandV2Schema,
  EngagementPreferencesV2Schema,
  PlayerTrustProjectionV2Schema,
  RequestRepeatSessionCommandV2Schema,
  RequestRepeatSessionReceiptV2Schema,
  SessionCompletedEventV2Schema,
  SubmitPlayerEndorsementCommandV2Schema,
  UpdateEngagementPreferencesCommandV2Schema,
  type ActivityItemV2,
  type EngagementPreferencesV2,
  type ParticipationConfirmationV2,
  type PlayerEndorsementV2,
  type PlayerTrustProjectionV2,
  type ReputationDimensionV2,
  type ReputationLedgerEntryV2,
  type RepeatTeammateRelationshipV2,
  type SessionOutcomeSnapshotV2,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';

import type {
  ActivityFeedRepository,
  EndorsementCommandService,
  EngagementPolicyProvider,
  PlayerTrustProjectionProvider,
  ReputationLedgerProvider,
  RepeatPlayRecommendationProvider,
  SessionCompletedEventV2,
  SessionOutcomeRepository,
} from './trust-outcomes-repositories';

type Clock = () => Date;
type Receipt = Readonly<{ request: string; response: unknown }>;

const DEFAULT_PREFERENCES = {
  activityEnabled: true,
  feedbackPromptsEnabled: true,
  maxReactivationNotificationsPerDay: 2,
  pushReactivationEnabled: true,
  repeatPlayPromptsEnabled: true,
} as const;

export class InMemoryTrustOutcomesEngine
  implements
    SessionOutcomeRepository,
    EndorsementCommandService,
    ReputationLedgerProvider,
    PlayerTrustProjectionProvider,
    ActivityFeedRepository,
    RepeatPlayRecommendationProvider,
    EngagementPolicyProvider
{
  private sequence = 1;
  private readonly processedCompletionEvents = new Map<
    string,
    SessionOutcomeSnapshotV2
  >();
  private readonly outcomes = new Map<string, SessionOutcomeSnapshotV2>();
  private readonly confirmations = new Map<
    string,
    ParticipationConfirmationV2
  >();
  private readonly endorsements = new Map<string, PlayerEndorsementV2>();
  private readonly ledger = new Map<string, ReputationLedgerEntryV2>();
  private readonly projections = new Map<string, PlayerTrustProjectionV2>();
  private readonly activities = new Map<string, ActivityItemV2>();
  private readonly repeatRelationships = new Map<
    string,
    RepeatTeammateRelationshipV2
  >();
  private readonly repeatRequests = new Map<
    string,
    Readonly<{
      correlationId: string;
      repeated: boolean;
      requestId: string;
      teammatePlayerIds: string[];
      version: number;
    }>
  >();
  private readonly preferences = new Map<string, EngagementPreferencesV2>();
  private readonly receipts = new Map<string, Receipt>();

  constructor(private readonly clock: Clock = () => new Date()) {}

  async consumeCompletedSession(rawEvent: SessionCompletedEventV2) {
    const event = SessionCompletedEventV2Schema.parse(rawEvent);
    const replay = this.processedCompletionEvents.get(event.eventId);
    if (replay) return replay;

    const existing = this.outcomes.get(event.payload.sessionId);
    if (existing) {
      if (existing.sessionVersion !== event.aggregateVersion) {
        throw coreV2Error(
          'aggregate_version_conflict',
          'A completed-session event was replayed with a different session version.',
        );
      }
      this.processedCompletionEvents.set(event.eventId, existing);
      return existing;
    }

    const outcome = {
      completedAt: event.payload.completedAt,
      confirmationDeadlineAt: new Date(
        Date.parse(event.payload.completedAt) + 72 * 60 * 60 * 1000,
      ).toISOString(),
      memberPlayerIds: [...event.payload.participantPlayerIds],
      outcomeId: this.uuid('outcome') as never,
      sessionId: event.payload.sessionId,
      sessionVersion: event.aggregateVersion,
      startedAt: event.payload.startedAt,
      state: 'awaiting_confirmation' as const,
      version: 1,
    } satisfies SessionOutcomeSnapshotV2;

    this.outcomes.set(outcome.sessionId, outcome);
    this.processedCompletionEvents.set(event.eventId, outcome);
    for (const playerId of outcome.memberPlayerIds) {
      this.createActivity({
        deduplicationKey: `feedback:${outcome.sessionId}:${playerId}`,
        kind: 'feedback_prompt',
        payload: {
          confirmationDeadlineAt: outcome.confirmationDeadlineAt,
          sessionId: outcome.sessionId,
        },
        playerId,
        priority: 1000,
      });
    }
    return outcome;
  }

  async getOutcome(session: AuthSession, sessionId: string) {
    const actorPlayerId = requireActivePlayer(session);
    const outcome = this.outcomes.get(sessionId) ?? null;
    if (outcome && !outcome.memberPlayerIds.includes(actorPlayerId as never)) {
      throw coreV2Error(
        'forbidden',
        'Only session members can read this outcome.',
      );
    }
    return outcome;
  }

  async confirmParticipation(session: AuthSession, rawCommand: unknown) {
    const actorPlayerId = requireActivePlayer(session);
    const command =
      ConfirmSessionParticipationCommandV2Schema.parse(rawCommand);
    return this.executeReceipt(
      'confirm_session_participation_v2',
      actorPlayerId,
      command.idempotencyKey,
      command,
      () => {
        const outcome = this.requireOutcomeMember(
          command.sessionId,
          actorPlayerId,
          command.expectedAggregateVersion,
        );
        const key = confirmationKey(outcome.sessionId, actorPlayerId);
        const existing = this.confirmations.get(key);
        if (existing?.status === 'disputed') {
          throw coreV2Error(
            'participation_already_disputed',
            'Disputed participation cannot be silently converted to confirmed.',
          );
        }

        const confirmation =
          existing ??
          ({
            confirmationId: this.uuid('confirmation') as never,
            confirmedAt: this.now(),
            playerId: actorPlayerId as never,
            reasonCode: null,
            sessionId: outcome.sessionId,
            status: 'confirmed',
            version: 1,
          } satisfies ParticipationConfirmationV2);
        this.confirmations.set(key, confirmation);
        this.appendLedger({
          delta: 1,
          dimension: 'completed_sessions',
          metadata: { sessionId: outcome.sessionId },
          playerId: actorPlayerId,
          sourceId: confirmation.confirmationId,
          sourceKey: `participation:${confirmation.confirmationId}:completed`,
          sourceType: 'participation_confirmation',
        });

        const next = this.updateOutcomeState(outcome);
        if (next.state === 'confirmed') this.deriveRepeatTeammates(next);
        return {
          confirmation,
          correlationId: command.correlationId,
          outcome: next,
          repeated: false,
        };
      },
    );
  }

  async disputeParticipation(session: AuthSession, rawCommand: unknown) {
    const actorPlayerId = requireActivePlayer(session);
    const command =
      DisputeSessionParticipationCommandV2Schema.parse(rawCommand);
    return this.executeReceipt(
      'dispute_session_participation_v2',
      actorPlayerId,
      command.idempotencyKey,
      command,
      () => {
        const outcome = this.requireOutcomeMember(
          command.sessionId,
          actorPlayerId,
          command.expectedAggregateVersion,
        );
        const key = confirmationKey(outcome.sessionId, actorPlayerId);
        if (this.confirmations.has(key)) {
          throw coreV2Error(
            'participation_already_recorded',
            'Participation has already been recorded for this session.',
          );
        }
        const confirmation = {
          confirmationId: this.uuid('confirmation') as never,
          confirmedAt: this.now(),
          playerId: actorPlayerId as never,
          reasonCode: command.reasonCode,
          sessionId: outcome.sessionId,
          status: 'disputed' as const,
          version: 1,
        } satisfies ParticipationConfirmationV2;
        this.confirmations.set(key, confirmation);
        const next = {
          ...outcome,
          state: 'disputed' as const,
          version: outcome.version + 1,
        } satisfies SessionOutcomeSnapshotV2;
        this.outcomes.set(outcome.sessionId, next);
        return {
          confirmation,
          correlationId: command.correlationId,
          outcome: next,
          repeated: false,
        };
      },
    );
  }

  async submit(session: AuthSession, rawCommand: unknown) {
    const actorPlayerId = requireActivePlayer(session);
    const command = SubmitPlayerEndorsementCommandV2Schema.parse(rawCommand);
    return this.executeReceipt(
      'submit_player_endorsement_v2',
      actorPlayerId,
      command.idempotencyKey,
      command,
      () => {
        if (actorPlayerId === command.targetPlayerId) {
          throw coreV2Error(
            'self_endorsement_forbidden',
            'Players cannot endorse themselves.',
          );
        }
        const outcome = this.requireOutcomeMember(
          command.sessionId,
          actorPlayerId,
          command.expectedAggregateVersion,
        );
        if (!outcome.memberPlayerIds.includes(command.targetPlayerId)) {
          throw coreV2Error(
            'target_not_session_member',
            'The endorsed player was not a session member.',
          );
        }
        if (outcome.state !== 'confirmed') {
          throw coreV2Error(
            'session_not_confirmed',
            'Endorsements require a confirmed completed session.',
          );
        }
        for (const playerId of [actorPlayerId, command.targetPlayerId]) {
          const confirmation = this.confirmations.get(
            confirmationKey(outcome.sessionId, playerId),
          );
          if (confirmation?.status !== 'confirmed') {
            throw coreV2Error(
              'participation_not_confirmed',
              'Both players must confirm participation before endorsement.',
            );
          }
        }
        const semanticKey = endorsementKey(
          outcome.sessionId,
          actorPlayerId,
          command.targetPlayerId,
        );
        if (this.endorsements.has(semanticKey)) {
          throw coreV2Error(
            'endorsement_already_submitted',
            'Only one endorsement submission per teammate and session is allowed.',
          );
        }
        const endorsement = {
          actorPlayerId: actorPlayerId as never,
          createdAt: this.now(),
          endorsementId: this.uuid('endorsement') as never,
          kinds: [...command.kinds],
          sessionId: outcome.sessionId,
          targetPlayerId: command.targetPlayerId,
          version: 1,
        } satisfies PlayerEndorsementV2;
        this.endorsements.set(semanticKey, endorsement);
        for (const kind of endorsement.kinds) {
          this.appendLedger({
            delta: 1,
            dimension: 'positive_endorsements',
            metadata: { endorsementKind: kind, sessionId: outcome.sessionId },
            playerId: command.targetPlayerId,
            sourceId: endorsement.endorsementId,
            sourceKey: `endorsement:${endorsement.endorsementId}:${kind}`,
            sourceType: 'endorsement',
          });
        }
        const projection = this.rebuildProjectionSync(command.targetPlayerId);
        this.createActivity({
          deduplicationKey: `reputation:${endorsement.endorsementId}`,
          kind: 'reputation_progress',
          payload: {
            endorsementKinds: endorsement.kinds,
            projectionVersion: projection.projectionVersion,
            sessionId: outcome.sessionId,
          },
          playerId: command.targetPlayerId,
          priority: 500,
        });
        return {
          correlationId: command.correlationId,
          endorsement,
          repeated: false,
        };
      },
    );
  }

  async listForPlayer(session: AuthSession, playerId: string) {
    const actorPlayerId = requireActivePlayer(session);
    if (actorPlayerId !== playerId) {
      throw coreV2Error(
        'privacy_capability_required',
        'Cross-player trust facts require the Social privacy capability provider.',
      );
    }
    return [...this.ledger.values()].filter(
      (entry) => entry.playerId === playerId,
    );
  }

  async rebuildProjection(playerId: string) {
    return this.rebuildProjectionSync(playerId, true);
  }

  async getForPlayer(session: AuthSession, playerId: string) {
    const actorPlayerId = requireActivePlayer(session);
    if (actorPlayerId !== playerId) {
      throw coreV2Error(
        'privacy_capability_required',
        'Public trust display remains disabled until privacy capability is integrated.',
      );
    }
    return this.rebuildProjectionSync(playerId);
  }

  async list(
    session: AuthSession,
    input: Readonly<{ includeDismissed?: boolean; limit?: number }> = {},
  ) {
    const actorPlayerId = requireActivePlayer(session);
    const preferences = this.getPreferencesSync(actorPlayerId);
    if (!preferences.activityEnabled) return [];
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    return [...this.activities.values()]
      .filter(
        (item) =>
          item.playerId === actorPlayerId &&
          (input.includeDismissed || item.dismissedAt === null),
      )
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      )
      .slice(0, limit);
  }

  async dismiss(session: AuthSession, rawCommand: unknown) {
    const actorPlayerId = requireActivePlayer(session);
    const command = DismissActivityItemCommandV2Schema.parse(rawCommand);
    return this.executeReceipt(
      'dismiss_activity_item_v2',
      actorPlayerId,
      command.idempotencyKey,
      command,
      () => {
        const item = this.activities.get(command.activityItemId);
        if (!item || item.playerId !== actorPlayerId) {
          throw coreV2Error(
            'activity_item_not_found',
            'The activity item is unavailable.',
          );
        }
        if (item.version !== command.expectedAggregateVersion) {
          throw aggregateVersionError(
            command.expectedAggregateVersion,
            item.version,
          );
        }
        const next = ActivityItemV2Schema.parse({
          ...item,
          dismissedAt: this.now(),
          version: item.version + 1,
        });
        this.activities.set(next.activityItemId, next);
        return next;
      },
    );
  }

  async listRecommendations(session: AuthSession) {
    return (await this.list(session, { limit: 50 })).filter(
      (item) => item.kind === 'repeat_play_recommendation',
    );
  }

  async requestRepeatSession(session: AuthSession, rawCommand: unknown) {
    const actorPlayerId = requireActivePlayer(session);
    const command = RequestRepeatSessionCommandV2Schema.parse(rawCommand);
    return this.executeReceipt(
      'request_repeat_session_v2',
      actorPlayerId,
      command.idempotencyKey,
      command,
      () => {
        if (command.teammatePlayerIds.includes(actorPlayerId as never)) {
          throw coreV2Error(
            'self_repeat_forbidden',
            'The requester cannot be a teammate target.',
          );
        }
        for (const teammatePlayerId of command.teammatePlayerIds) {
          const relationship = this.repeatRelationships.get(
            pairKey(actorPlayerId, teammatePlayerId),
          );
          if (!relationship) {
            throw coreV2Error(
              'repeat_teammate_not_found',
              'Repeat play requires an authoritative repeat-teammate relationship.',
            );
          }
          if (relationship.version !== command.expectedAggregateVersion) {
            throw aggregateVersionError(
              command.expectedAggregateVersion,
              relationship.version,
            );
          }
        }
        const request = RequestRepeatSessionReceiptV2Schema.parse({
          correlationId: command.correlationId,
          repeated: false,
          requestId: this.uuid('repeat-request'),
          teammatePlayerIds: [...command.teammatePlayerIds],
          version: 1,
        });
        this.repeatRequests.set(request.requestId, request);
        return request;
      },
    );
  }

  async getPreferences(session: AuthSession) {
    return this.getPreferencesSync(requireActivePlayer(session));
  }

  async updatePreferences(session: AuthSession, rawCommand: unknown) {
    const actorPlayerId = requireActivePlayer(session);
    const command =
      UpdateEngagementPreferencesCommandV2Schema.parse(rawCommand);
    return this.executeReceipt(
      'update_engagement_preferences_v2',
      actorPlayerId,
      command.idempotencyKey,
      command,
      () => {
        const current = this.getPreferencesSync(actorPlayerId);
        if (current.version !== command.expectedAggregateVersion) {
          throw aggregateVersionError(
            command.expectedAggregateVersion,
            current.version,
          );
        }
        const next = EngagementPreferencesV2Schema.parse({
          ...current,
          ...command.preferences,
          updatedAt: this.now(),
          version: current.version + 1,
        });
        this.preferences.set(actorPlayerId, next);
        return next;
      },
    );
  }

  private getPreferencesSync(playerId: string) {
    const existing = this.preferences.get(playerId);
    if (existing) return existing;
    const created = EngagementPreferencesV2Schema.parse({
      ...DEFAULT_PREFERENCES,
      playerId,
      updatedAt: this.now(),
      version: 1,
    });
    this.preferences.set(playerId, created);
    return created;
  }

  private requireOutcomeMember(
    sessionId: string,
    playerId: string,
    expectedVersion: number,
  ) {
    const outcome = this.outcomes.get(sessionId);
    if (!outcome) {
      throw coreV2Error(
        'session_outcome_not_found',
        'The completed session outcome is unavailable.',
      );
    }
    if (!outcome.memberPlayerIds.includes(playerId as never)) {
      throw coreV2Error(
        'forbidden',
        'Only session members can change participation.',
      );
    }
    if (outcome.version !== expectedVersion) {
      throw aggregateVersionError(expectedVersion, outcome.version);
    }
    return outcome;
  }

  private updateOutcomeState(outcome: SessionOutcomeSnapshotV2) {
    const statuses = outcome.memberPlayerIds.map(
      (playerId) =>
        this.confirmations.get(confirmationKey(outcome.sessionId, playerId))
          ?.status ?? null,
    );
    const state = statuses.includes('disputed')
      ? 'disputed'
      : statuses.every((status) => status === 'confirmed')
        ? 'confirmed'
        : 'awaiting_confirmation';
    const next = {
      ...outcome,
      state,
      version: outcome.version + 1,
    } satisfies SessionOutcomeSnapshotV2;
    this.outcomes.set(outcome.sessionId, next);
    return next;
  }

  private deriveRepeatTeammates(outcome: SessionOutcomeSnapshotV2) {
    for (let left = 0; left < outcome.memberPlayerIds.length; left += 1) {
      for (
        let right = left + 1;
        right < outcome.memberPlayerIds.length;
        right += 1
      ) {
        const leftId = outcome.memberPlayerIds[left];
        const rightId = outcome.memberPlayerIds[right];
        if (!leftId || !rightId) continue;
        const [playerLowId, playerHighId] = canonicalPair(leftId, rightId);
        const completed = [...this.outcomes.values()].filter(
          (candidate) =>
            candidate.state === 'confirmed' &&
            candidate.memberPlayerIds.includes(playerLowId as never) &&
            candidate.memberPlayerIds.includes(playerHighId as never),
        );
        if (completed.length < 2) continue;
        const key = pairKey(playerLowId, playerHighId);
        const existing = this.repeatRelationships.get(key);
        const relationship = {
          completedSessionCount: completed.length,
          firstCompletedAt: completed
            .map((item) => item.completedAt)
            .sort()[0] as string,
          lastCompletedAt: completed
            .map((item) => item.completedAt)
            .sort()
            .at(-1) as string,
          playerHighId: playerHighId as never,
          playerLowId: playerLowId as never,
          relationshipId:
            existing?.relationshipId ?? (this.uuid('repeat-teammate') as never),
          version: existing ? existing.version + 1 : 1,
        } satisfies RepeatTeammateRelationshipV2;
        this.repeatRelationships.set(key, relationship);
        if (!existing) {
          for (const [playerId, teammatePlayerId] of [
            [playerLowId, playerHighId],
            [playerHighId, playerLowId],
          ] as const) {
            this.appendLedger({
              delta: 1,
              dimension: 'repeat_teammate_count',
              metadata: { teammatePlayerId },
              playerId,
              sourceId: relationship.relationshipId,
              sourceKey: `repeat:${relationship.relationshipId}:${playerId}`,
              sourceType: 'repeat_teammate',
            });
            this.createActivity({
              deduplicationKey: `repeat:${relationship.relationshipId}:${playerId}:${relationship.version}`,
              kind: 'repeat_play_recommendation',
              payload: {
                completedSessionCount: relationship.completedSessionCount,
                relationshipId: relationship.relationshipId,
                teammatePlayerId,
              },
              playerId,
              priority: 800,
            });
          }
        }
      }
    }
  }

  private appendLedger(input: {
    delta: number;
    dimension: ReputationDimensionV2;
    metadata: Record<string, unknown>;
    playerId: string;
    sourceId: string;
    sourceKey: string;
    sourceType: ReputationLedgerEntryV2['sourceType'];
  }) {
    if (this.ledger.has(input.sourceKey)) return;
    const entry = {
      createdAt: this.now(),
      delta: input.delta,
      dimension: input.dimension,
      entryId: this.uuid('ledger') as never,
      metadata: input.metadata,
      playerId: input.playerId as never,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
    } satisfies ReputationLedgerEntryV2;
    this.ledger.set(input.sourceKey, entry);
    this.rebuildProjectionSync(input.playerId);
  }

  private rebuildProjectionSync(playerId: string, rebuilt = false) {
    const entries = [...this.ledger.values()].filter(
      (entry) => entry.playerId === playerId,
    );
    const sum = (dimension: ReputationDimensionV2) =>
      entries
        .filter((entry) => entry.dimension === dimension)
        .reduce((total, entry) => total + entry.delta, 0);
    const completedSessions = Math.max(0, sum('completed_sessions'));
    const noShowCount = Math.max(0, sum('no_show_count'));
    const denominator = completedSessions + noShowCount;
    const previous = this.projections.get(playerId);
    const now = this.now();
    const projection = PlayerTrustProjectionV2Schema.parse({
      completedSessions,
      completionReliabilityBps:
        denominator === 0
          ? 0
          : Math.round((completedSessions / denominator) * 10_000),
      confirmedModerationActions: Math.max(
        0,
        sum('confirmed_moderation_actions'),
      ),
      noShowCount,
      playerId,
      positiveEndorsements: Math.max(0, sum('positive_endorsements')),
      projectionVersion: entries.length,
      rebuiltAt: rebuilt ? now : (previous?.rebuiltAt ?? null),
      repeatTeammateCount: Math.max(0, sum('repeat_teammate_count')),
      updatedAt: now,
    });
    this.projections.set(playerId, projection);
    return projection;
  }

  private createActivity(input: {
    deduplicationKey: string;
    kind: ActivityItemV2['kind'];
    payload: Record<string, unknown>;
    playerId: string;
    priority: number;
  }) {
    const existing = [...this.activities.values()].find(
      (item) => item.deduplicationKey === input.deduplicationKey,
    );
    if (existing) return existing;
    const item = ActivityItemV2Schema.parse({
      activityItemId: this.uuid('activity'),
      createdAt: this.now(),
      deduplicationKey: input.deduplicationKey,
      dismissedAt: null,
      kind: input.kind,
      payload: input.payload,
      playerId: input.playerId,
      priority: input.priority,
      version: 1,
    });
    this.activities.set(item.activityItemId, item);
    return item;
  }

  private executeReceipt<T>(
    commandName: string,
    playerId: string,
    idempotencyKey: string,
    request: unknown,
    execute: () => T,
  ): T {
    const key = `${commandName}:${playerId}:${idempotencyKey}`;
    const requestJson = stableJson(request);
    const existing = this.receipts.get(key);
    if (existing) {
      if (existing.request !== requestJson) {
        throw coreV2Error(
          'idempotency_key_reused',
          'The idempotency key was reused with a different command.',
        );
      }
      return { ...(existing.response as object), repeated: true } as T;
    }
    const response = execute();
    this.receipts.set(key, { request: requestJson, response });
    return response;
  }

  private now() {
    return this.clock().toISOString();
  }

  private uuid(_kind: string) {
    const tail = String(this.sequence).padStart(12, '0');
    this.sequence += 1;
    return `50000000-0000-4000-8000-${tail}`;
  }
}

function requireActivePlayer(session: AuthSession) {
  const playerId = session.principal?.playerId;
  if (!playerId || !session.lifecycle) {
    throw coreV2Error(
      'canonical_player_required',
      'A canonical player identity is required.',
    );
  }
  if (session.lifecycle.playerId !== playerId) {
    throw coreV2Error(
      'identity_mismatch',
      'Principal and lifecycle PlayerId must match.',
    );
  }
  if (session.lifecycle.state !== 'active') {
    throw coreV2Error(
      `player_${session.lifecycle.state}`,
      'The player lifecycle must be active.',
    );
  }
  return playerId;
}

function confirmationKey(sessionId: string, playerId: string) {
  return `${sessionId}:${playerId}`;
}

function endorsementKey(sessionId: string, actorId: string, targetId: string) {
  return `${sessionId}:${actorId}:${targetId}`;
}

function canonicalPair(left: string, right: string) {
  return left < right ? ([left, right] as const) : ([right, left] as const);
}

function pairKey(left: string, right: string) {
  return canonicalPair(left, right).join(':');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function aggregateVersionError(expected: number, actual: number) {
  return coreV2Error(
    'aggregate_version_conflict',
    `Expected aggregate version ${expected}, received ${actual}.`,
  );
}

function coreV2Error(code: string, message: string) {
  return Object.assign(new Error(message), { code, retryable: false });
}
