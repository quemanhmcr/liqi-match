import { fireEvent, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import type {
  EndorsementCommandService,
  SessionOutcomeRepository,
} from '@/entities/trust-outcomes';
import {
  ParticipationCommandReceiptV2Schema,
  PlayerIdSchema,
  PlaySessionIdSchema,
  SessionFeedbackSurfaceV2Schema,
  SessionOutcomeSnapshotV2Schema,
  SubmitPlayerEndorsementReceiptV2Schema,
} from '@/shared/contracts/core-v2';
import {
  renderWithProviders,
  testAuthSession,
} from '@/test/render-with-providers';

import { SessionFeedbackScreen } from '../screens/SessionFeedbackScreen';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: jest.fn(async () => 'a'.repeat(64)),
  randomUUID: jest
    .fn()
    .mockReturnValueOnce('43000000-0000-4000-8000-000000000101')
    .mockReturnValueOnce('43000000-0000-4000-8000-000000000102')
    .mockReturnValueOnce('43000000-0000-4000-8000-000000000103')
    .mockReturnValueOnce('43000000-0000-4000-8000-000000000104')
    .mockReturnValue('43000000-0000-4000-8000-000000000199'),
}));

const SESSION_ID = PlaySessionIdSchema.parse(
  '42000000-0000-4000-8000-000000000001',
);
const PLAYER_A = PlayerIdSchema.parse(
  testAuthSession.principal?.playerId ?? '20000000-0000-4000-8000-000000000001',
);
const PLAYER_B = PlayerIdSchema.parse('20000000-0000-4000-8000-000000000002');
const outcome = SessionOutcomeSnapshotV2Schema.parse({
  completedAt: '2026-07-14T14:00:00.000Z',
  confirmationDeadlineAt: '2026-07-17T14:00:00.000Z',
  outcomeId: '44000000-0000-4000-8000-000000000001',
  participantPlayerIds: [PLAYER_A, PLAYER_B],
  scheduledFor: null,
  sessionId: SESSION_ID,
  sourceSessionVersion: 9,
  startedAt: '2026-07-14T12:00:00.000Z',
  state: 'recorded' as const,
  version: 1,
});

function surface(overrides: Record<string, unknown> = {}) {
  return SessionFeedbackSurfaceV2Schema.parse({
    actorConfirmation: null,
    actorPlayerId: PLAYER_A,
    allParticipantsConfirmed: false,
    confirmedPlayerIds: [],
    endorsementTargetPlayerIds: [],
    outcome,
    ...overrides,
  });
}

function confirmationReceipt(version = 2) {
  return ParticipationCommandReceiptV2Schema.parse({
    aggregateId: outcome.outcomeId,
    aggregateType: 'session_outcome',
    aggregateVersion: version,
    commandName: 'confirm_session_participation_v2',
    confirmation: {
      confirmationId: '45000000-0000-4000-8000-000000000001',
      confirmedAt: '2026-07-14T14:05:00.000Z',
      playerId: PLAYER_A,
      reasonCode: null,
      sessionId: SESSION_ID,
      status: 'confirmed',
      version: 1,
    },
    correlationId: '43000000-0000-4000-8000-000000000102',
    eventIds: ['48000000-0000-4000-8000-000000000001'],
    occurredAt: '2026-07-14T14:05:00.000Z',
    outcome: { ...outcome, version },
    repeated: false,
    resultCode: 'participation_confirmed',
  });
}

const defaultOutcomeRepository = {
  confirmParticipation: jest.fn<
    SessionOutcomeRepository['confirmParticipation']
  >(async () => confirmationReceipt()),
  consumeCompletedSession: jest.fn<
    SessionOutcomeRepository['consumeCompletedSession']
  >(async () => outcome),
  disputeParticipation: jest.fn<
    SessionOutcomeRepository['disputeParticipation']
  >(async () => confirmationReceipt()),
  getFeedbackSurface: jest.fn<SessionOutcomeRepository['getFeedbackSurface']>(
    async () => surface(),
  ),
  getOutcome: jest.fn<SessionOutcomeRepository['getOutcome']>(
    async () => outcome,
  ),
} satisfies SessionOutcomeRepository;

const defaultEndorsementService = {
  submit: jest.fn<EndorsementCommandService['submit']>(async () =>
    SubmitPlayerEndorsementReceiptV2Schema.parse({
      aggregateId: '46000000-0000-4000-8000-000000000001',
      aggregateType: 'player_endorsement',
      aggregateVersion: 1,
      commandName: 'submit_player_endorsement_v2',
      correlationId: '43000000-0000-4000-8000-000000000104',
      endorsement: {
        actorPlayerId: PLAYER_A,
        createdAt: '2026-07-14T14:10:00.000Z',
        endorsementId: '46000000-0000-4000-8000-000000000001',
        kinds: ['would_play_again'],
        sessionId: SESSION_ID,
        targetPlayerId: PLAYER_B,
        version: 1,
      },
      eventIds: ['48000000-0000-4000-8000-000000000002'],
      occurredAt: '2026-07-14T14:10:00.000Z',
      repeated: false,
      resultCode: 'endorsement_submitted',
    }),
  ),
};

describe('SessionFeedbackScreen', () => {
  it('confirms participation using the authoritative outcome version', async () => {
    const confirmParticipation = jest.fn<
      SessionOutcomeRepository['confirmParticipation']
    >(async () => confirmationReceipt());
    const screen = await renderWithProviders(
      <SessionFeedbackScreen sessionId={SESSION_ID} />,
      {
        serviceOverrides: {
          sessionOutcomeRepository: {
            ...defaultOutcomeRepository,
            confirmParticipation,
          },
        },
      },
    );

    await fireEvent.press(await screen.findByText('Đã tham gia'));
    await waitFor(() => expect(confirmParticipation).toHaveBeenCalledTimes(1));
    expect(confirmParticipation.mock.calls[0]?.[1]).toMatchObject({
      expectedVersion: 1,
      sessionId: SESSION_ID,
    });
  });

  it('submits positive endorsement only after full confirmation', async () => {
    const submit = jest.fn<EndorsementCommandService['submit']>(
      defaultEndorsementService.submit,
    );
    const confirmed = confirmationReceipt(3).confirmation;
    const screen = await renderWithProviders(
      <SessionFeedbackScreen sessionId={SESSION_ID} />,
      {
        serviceOverrides: {
          endorsementCommandService: { submit },
          sessionOutcomeRepository: {
            ...defaultOutcomeRepository,
            getFeedbackSurface: jest.fn<
              SessionOutcomeRepository['getFeedbackSurface']
            >(async () =>
              surface({
                actorConfirmation: confirmed,
                allParticipantsConfirmed: true,
                confirmedPlayerIds: [PLAYER_A, PLAYER_B],
                endorsementTargetPlayerIds: [PLAYER_B],
                outcome: { ...outcome, version: 3 },
              }),
            ),
          },
        },
      },
    );

    await fireEvent.press(await screen.findByText('Gửi lời khen'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[1]).toMatchObject({
      expectedOutcomeVersion: 3,
      expectedVersion: 0,
      kinds: ['would_play_again'],
      sessionId: SESSION_ID,
      targetPlayerId: PLAYER_B,
    });
  });

  it('fails closed for disputed participation and hides endorsement controls', async () => {
    const disputed = {
      ...confirmationReceipt().confirmation,
      reasonCode: 'session_did_not_happen' as const,
      status: 'disputed' as const,
    };
    const screen = await renderWithProviders(
      <SessionFeedbackScreen sessionId={SESSION_ID} />,
      {
        serviceOverrides: {
          sessionOutcomeRepository: {
            ...defaultOutcomeRepository,
            getFeedbackSurface: jest.fn<
              SessionOutcomeRepository['getFeedbackSurface']
            >(async () =>
              surface({
                actorConfirmation: disputed,
                outcome: { ...outcome, state: 'disputed', version: 2 },
              }),
            ),
          },
        },
      },
    );

    expect(
      await screen.findByText(
        'Vấn đề đã được ghi nhận. Session này chưa tạo trust tích cực.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Gửi lời khen')).toBeNull();
  });
});
