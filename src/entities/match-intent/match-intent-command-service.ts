import type { MatchIntentFiltersV1 } from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';

import { resolveActiveMatchIntentActor } from './match-intent-actor';
import type { MatchIntentCommandJournal } from './match-intent-command-journal';
import type { MatchIntentRepository } from './match-intent-repository';

type JournalPort = Pick<
  MatchIntentCommandJournal,
  'activation' | 'complete' | 'pause'
>;

export async function activateMatchIntent(input: {
  expectedVersion?: number;
  filters: MatchIntentFiltersV1;
  journal: JournalPort;
  repository: MatchIntentRepository;
  session: AuthSession;
}) {
  const actor = resolveActiveMatchIntentActor(input.session);
  const command = await input.journal.activation({
    accountId: actor.accountId,
    expectedVersion: input.expectedVersion,
    filters: input.filters,
  });
  const receipt = await input.repository.activate(input.session, {
    expectedVersion: command.expectedVersion ?? undefined,
    filters: command.filters,
    idempotencyKey: command.idempotencyKey,
  });
  await input.journal.complete(
    'activate',
    actor.accountId,
    command.idempotencyKey,
  );
  return receipt;
}

export async function pauseMatchIntent(input: {
  expectedVersion: number;
  journal: JournalPort;
  repository: MatchIntentRepository;
  session: AuthSession;
}) {
  const actor = resolveActiveMatchIntentActor(input.session);
  const command = await input.journal.pause({
    accountId: actor.accountId,
    expectedVersion: input.expectedVersion,
  });
  const receipt = await input.repository.pause(input.session, {
    expectedVersion: command.expectedVersion,
    idempotencyKey: command.idempotencyKey,
  });
  await input.journal.complete(
    'pause',
    actor.accountId,
    command.idempotencyKey,
  );
  return receipt;
}
