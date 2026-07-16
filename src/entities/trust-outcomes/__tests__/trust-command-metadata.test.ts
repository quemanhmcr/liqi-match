import { describe, expect, it } from '@jest/globals';

import {
  createTrustCreateMetadata,
  createTrustCreateMetadataForSource,
  createTrustMutationMetadata,
  createTrustMutationMetadataForSource,
} from '../trust-command-metadata';

function uuidSequence() {
  let sequence = 1;
  return () =>
    `43000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
}

describe('trust command metadata', () => {
  it('creates mutation metadata with audit, correlation and stable URL-safe idempotency', () => {
    const metadata = createTrustMutationMetadata(7, 'confirm-participation', {
      appVersion: '2.0.0',
      createUuid: uuidSequence(),
      now: () => new Date('2026-07-14T14:00:00.000Z'),
      platform: 'android',
    });

    expect(metadata).toEqual({
      audit: {
        appVersion: '2.0.0',
        clientCreatedAt: '2026-07-14T14:00:00.000Z',
        clientRequestId: '43000000-0000-4000-8000-000000000001',
        platform: 'android',
      },
      correlationId: '43000000-0000-4000-8000-000000000002',
      expectedVersion: 7,
      idempotencyKey:
        'trust:confirm-participation:43000000-0000-4000-8000-000000000001',
    });
  });

  it('derives retry-stable metadata from an authoritative source UUID', () => {
    const first = createTrustMutationMetadataForSource(
      3,
      'confirm-participation',
      '42000000-0000-4000-8000-000000000001',
      [],
      {
        appVersion: '2.0.0',
        now: () => new Date('2026-07-14T14:00:00.000Z'),
        platform: 'android',
      },
    );
    const retry = createTrustMutationMetadataForSource(
      3,
      'confirm-participation',
      '42000000-0000-4000-8000-000000000001',
      [],
      {
        appVersion: '2.0.0',
        now: () => new Date('2026-07-14T14:01:00.000Z'),
        platform: 'android',
      },
    );
    const endorsement = createTrustCreateMetadataForSource(
      'submit-endorsement',
      '42000000-0000-4000-8000-000000000001',
      ['20000000-0000-4000-8000-000000000002'],
      {
        appVersion: '2.0.0',
        now: () => new Date('2026-07-14T14:00:00.000Z'),
        platform: 'android',
      },
    );

    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(retry.correlationId).toBe(first.correlationId);
    expect(endorsement).toMatchObject({
      correlationId: first.correlationId,
      expectedVersion: 0,
      idempotencyKey:
        'trust:submit-endorsement:42000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000002',
    });
  });

  it('uses create-version zero for new endorsement/repeat aggregates', () => {
    expect(
      createTrustCreateMetadata('submit-endorsement', {
        appVersion: '2.0.0',
        createUuid: uuidSequence(),
        now: () => new Date('2026-07-14T14:00:00.000Z'),
        platform: 'ios',
      }),
    ).toMatchObject({ expectedVersion: 0 });
  });
});
