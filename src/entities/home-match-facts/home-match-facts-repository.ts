import type { HomeMatchFactsV1 } from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';

export interface HomeMatchFactsRepository {
  list(session: AuthSession): Promise<HomeMatchFactsV1>;
}
