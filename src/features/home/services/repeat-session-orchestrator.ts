import type {
  ActivityFeedRepository,
  RepeatPlayRecommendationProvider,
} from '@/entities/trust-outcomes';
import {
  createTrustCreateMetadataForSource,
  createTrustMutationMetadataForSource,
} from '@/entities/trust-outcomes';
import type {
  PlaySessionActorContext,
  PlaySessionCommandService,
} from '@/entities/play-session';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  TrustActivityItemV2Schema,
  type TrustActivityItemV2,
} from '@/shared/contracts/core-v2';

export class RepeatSessionOrchestrationError extends Error {
  constructor(
    readonly code:
      | 'active_player_required'
      | 'invalid_repeat_activity'
      | 'identity_mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'RepeatSessionOrchestrationError';
  }
}

export async function orchestrateRepeatSession(input: {
  activity: TrustActivityItemV2;
  activityFeedRepository: ActivityFeedRepository;
  authSession: AuthSession;
  playSessionCommandService: PlaySessionCommandService;
  repeatPlayRecommendationProvider: RepeatPlayRecommendationProvider;
  timezone?: string;
}) {
  const activity = TrustActivityItemV2Schema.parse(input.activity);
  if (activity.kind !== 'repeat_play_recommendation') {
    throw new RepeatSessionOrchestrationError(
      'invalid_repeat_activity',
      'Only repeat-play recommendation activities can create a session.',
    );
  }
  const actor = requireActiveActor(input.authSession);
  if (activity.payload.teammatePlayerIds.length !== 1) {
    throw new RepeatSessionOrchestrationError(
      'invalid_repeat_activity',
      'The current repeat-play activity must identify exactly one teammate.',
    );
  }
  const teammatePlayerId = activity.payload.teammatePlayerIds[0];
  if (!teammatePlayerId) {
    throw new RepeatSessionOrchestrationError(
      'invalid_repeat_activity',
      'The repeat-play recommendation has no teammate.',
    );
  }

  const repeatRequest =
    await input.repeatPlayRecommendationProvider.requestRepeatSession(
      input.authSession,
      {
        ...createTrustCreateMetadataForSource(
          'request-repeat-session',
          activity.activityItemId,
        ),
        relationshipVersions: [
          {
            teammatePlayerId,
            version: activity.payload.relationshipVersion,
          },
        ],
        teammatePlayerIds: [teammatePlayerId],
      },
    );

  const playSession = await input.playSessionCommandService.create(actor, {
    ...createTrustCreateMetadataForSource(
      'create-repeat-session',
      activity.activityItemId,
    ),
    capacity: 2,
    initialInviteePlayerIds: [teammatePlayerId],
    scheduledFor: null,
    timezone: input.timezone ?? resolveTimezone(),
    title: 'Chơi lại cùng đồng đội',
  });

  let activityDismissed = true;
  try {
    await input.activityFeedRepository.dismiss(input.authSession, {
      ...createTrustMutationMetadataForSource(
        activity.version,
        'dismiss-repeat-activity',
        activity.activityItemId,
      ),
      activityItemId: activity.activityItemId,
    });
  } catch {
    // Session creation is authoritative and already complete. A retry replays the
    // same request/session commands and can safely retry only the dismissal.
    activityDismissed = false;
  }

  return {
    activityDismissed,
    playSession,
    repeatRequest,
  } as const;
}

function requireActiveActor(session: AuthSession): PlaySessionActorContext {
  const { lifecycle, principal } = session;
  if (!principal?.playerId || !lifecycle) {
    throw new RepeatSessionOrchestrationError(
      'active_player_required',
      'Repeat play requires a canonical active player.',
    );
  }
  if (lifecycle.playerId !== principal.playerId) {
    throw new RepeatSessionOrchestrationError(
      'identity_mismatch',
      'Principal and lifecycle PlayerId must match.',
    );
  }
  if (lifecycle.state !== 'active') {
    throw new RepeatSessionOrchestrationError(
      'active_player_required',
      'Repeat play requires an active player lifecycle.',
    );
  }
  return { lifecycle, principal };
}

function resolveTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
