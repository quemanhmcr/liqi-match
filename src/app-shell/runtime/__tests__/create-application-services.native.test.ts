import { describe, expect, it } from '@jest/globals';

import { ApplicationServiceUnavailableError } from '../application-service-error';
import {
  createApiApplicationServices,
  createSimulationApplicationServices,
} from '../create-application-services';

const context = {
  locale: 'vi',
  session: null,
  timezone: 'Asia/Bangkok',
  viewerId: 'viewer-1',
};

describe('application service composition', () => {
  it('creates isolated simulation service instances', async () => {
    const first = createSimulationApplicationServices();
    const second = createSimulationApplicationServices();

    expect(first.mode).toBe('simulation');
    expect(first.discoverRepository).not.toBe(second.discoverRepository);
    expect(first.messageRepository).not.toBe(second.messageRepository);
    expect(first.notificationRepository).not.toBe(
      second.notificationRepository,
    );

    const response = await first.discoverRepository.listPlayers(context, {
      cursor: undefined,
      facetIds: [],
      limit: 1,
      query: '',
      sort: 'best_match',
    });
    expect(response.data.items).toHaveLength(1);
  });

  it('does not silently replace unavailable API services with simulation data', async () => {
    const services = createApiApplicationServices();

    expect(services.mode).toBe('api');
    await expect(
      services.messageRepository.listConversations(),
    ).rejects.toBeInstanceOf(ApplicationServiceUnavailableError);
    await expect(
      services.notificationRepository.list({
        session: {
          accessToken: 'token',
          expiresAt: 4102444800,
          refreshToken: 'refresh',
          tokenType: 'bearer',
          user: { id: 'viewer-1', user_metadata: {} },
        },
      }),
    ).rejects.toBeInstanceOf(ApplicationServiceUnavailableError);
  });
});
