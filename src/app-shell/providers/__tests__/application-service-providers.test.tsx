import { describe, expect, it } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import type { ApplicationServices } from '@/app-shell/runtime/application-services';
import type { ApplicationRuntimeMode } from '@/app-shell/runtime/application-runtime-mode';
import { createSimulationApplicationServices } from '@/app-shell/runtime/create-application-services';
import { useHomeRepository, type HomeRepository } from '@/features/home';
import { testAuthSession } from '@/test/render-with-providers';

import { ApplicationServiceProviders } from '../ApplicationServiceProviders';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createHomeRepository(displayName: string): HomeRepository {
  return {
    async getDashboard() {
      return {
        activeMatchCount: 0,
        currentProfile: {
          displayName,
          readySummary: 'Ready',
          roleNames: [],
        },
        matchedSets: [],
        preview: false,
      };
    },
  };
}

function ConsumerScreen() {
  const repository = useHomeRepository();
  const [displayName, setDisplayName] = useState('loading');

  useEffect(() => {
    let active = true;
    void repository.getDashboard(testAuthSession).then((dashboard) => {
      if (active) setDisplayName(dashboard.currentProfile.displayName);
    });
    return () => {
      active = false;
    };
  }, [repository]);

  return <Text accessibilityLabel="runtime consumer">{displayName}</Text>;
}

async function renderConsumer(services: ApplicationServices) {
  return render(
    <ApplicationServiceProviders services={services}>
      <ConsumerScreen />
    </ApplicationServiceProviders>,
  );
}

describe('ApplicationServiceProviders replacement seam', () => {
  const cases: [ApplicationRuntimeMode, string][] = [
    ['simulation', 'Simulation Player'],
    ['api', 'API Player'],
  ];

  it.each(cases)(
    'keeps the consumer unchanged when the %s binding is selected',
    async (mode, expectedName) => {
      const services: ApplicationServices = {
        ...createSimulationApplicationServices(),
        homeRepository: createHomeRepository(expectedName),
        mode,
      };

      const screen = await renderConsumer(services);

      await waitFor(() => {
        expect(screen.getByLabelText('runtime consumer').props.children).toBe(
          expectedName,
        );
      });
    },
  );
});
