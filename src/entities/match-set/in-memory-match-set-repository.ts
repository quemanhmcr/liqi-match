import {
  CreateSetInviteCommandV1Schema,
  RequestSetJoinCommandV1Schema,
  type SetDiscoveryPageV1,
  type SetInviteReceiptV1,
  type SetJoinRequestReceiptV1,
} from '@/shared/contracts/core-v1';

import type { MatchSetRepository } from './match-set-repository';

export class InMemoryMatchSetRepository implements MatchSetRepository {
  private readonly inviteReceipts = new Map<string, SetInviteReceiptV1>();
  private readonly joinReceipts = new Map<string, SetJoinRequestReceiptV1>();

  constructor(
    private readonly page: SetDiscoveryPageV1 = {
      items: [],
      nextCursor: null,
      snapshot: {
        createdAt: new Date(0).toISOString(),
        expiresAt: new Date(10 * 60 * 1000).toISOString(),
        intentVersion: 1,
        snapshotId: 'a2000000-0000-4000-8000-000000000001' as never,
      },
    },
  ) {}

  async list() {
    return this.page;
  }

  async invite(_session: unknown, command: unknown) {
    const input = CreateSetInviteCommandV1Schema.parse(command);
    const replay = this.inviteReceipts.get(input.idempotencyKey);
    if (replay) return { ...replay, repeated: true };
    const receipt: SetInviteReceiptV1 = {
      inviteId: 'a3000000-0000-4000-8000-000000000001' as never,
      repeated: false,
      state: 'pending',
    };
    this.inviteReceipts.set(input.idempotencyKey, receipt);
    return receipt;
  }

  async requestJoin(_session: unknown, command: unknown) {
    const input = RequestSetJoinCommandV1Schema.parse(command);
    const replay = this.joinReceipts.get(input.idempotencyKey);
    if (replay) return { ...replay, repeated: true };
    const receipt: SetJoinRequestReceiptV1 = {
      joinRequestId: 'a4000000-0000-4000-8000-000000000001' as never,
      repeated: false,
      state: 'pending',
    };
    this.joinReceipts.set(input.idempotencyKey, receipt);
    return receipt;
  }
}
