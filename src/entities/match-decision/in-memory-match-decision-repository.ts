import {
  PlayerDecisionCommandV1Schema,
  type PlayerDecisionReceiptV1,
} from '@/shared/contracts/core-v1';

import type { MatchDecisionRepository } from './match-decision-repository';

export class InMemoryMatchDecisionRepository implements MatchDecisionRepository {
  private readonly receipts = new Map<string, PlayerDecisionReceiptV1>();
  private readonly relationships = new Map<string, 'liked' | 'passed'>();

  async decide(_session: unknown, command: unknown) {
    const input = PlayerDecisionCommandV1Schema.parse(command);
    const replay = this.receipts.get(input.idempotencyKey);
    if (replay) return { ...replay, repeated: true };

    const relationshipKey = `${input.targetPlayerId}`;
    const current = this.relationships.get(relationshipKey);
    const relationshipState = input.decision === 'like' ? 'liked' : 'passed';
    this.relationships.set(relationshipKey, relationshipState);
    const receipt: PlayerDecisionReceiptV1 = {
      match: null,
      relationshipState,
      repeated: current === relationshipState,
    };
    this.receipts.set(input.idempotencyKey, receipt);
    return receipt;
  }
}
