import { describe, expect, it, jest } from '@jest/globals';

import {
  PushDeviceInstallationStore,
  PushDeviceRegistrationService,
  type AuthenticatedPlayerContextV1,
  type NotificationDeviceApiRepository,
  type PushDeviceInstallationStorage,
  type PushNativeGateway,
} from '@/app-shell/push';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
  PlayerIdSchema,
} from '@/shared/contracts/core-v1';

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4_000_000_000,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: { id: '01000000-0000-4000-8000-000000000001' },
};

class MemoryInstallationStorage implements PushDeviceInstallationStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function playerContext(
  lifecycleState:
    | 'registered'
    | 'onboarding'
    | 'active'
    | 'suspended'
    | 'deleting'
    | 'deleted',
  options: Readonly<{
    expiresAt?: string;
    mapped?: boolean;
    mismatch?: boolean;
  }> = {},
): AuthenticatedPlayerContextV1 {
  const mapped = options.mapped ?? true;
  const principalPlayerId = mapped
    ? PlayerIdSchema.parse('20000000-0000-4000-8000-000000000001')
    : null;
  const principal = AuthenticatedPrincipalV1Schema.parse({
    accountId: '01000000-0000-4000-8000-000000000001',
    expiresAt: options.expiresAt ?? '2026-07-14T09:00:00.000Z',
    issuedAt: '2026-07-14T08:00:00.000Z',
    playerId: principalPlayerId,
    sessionId: '09000000-0000-4000-8000-000000000001',
  });
  if (!mapped) return { lifecycle: null, principal };

  const lifecycle = PlayerLifecycleSnapshotV1Schema.parse({
    discoverable: lifecycleState === 'active',
    messagingAllowed: lifecycleState === 'active',
    playerId: options.mismatch
      ? '20000000-0000-4000-8000-000000000002'
      : principalPlayerId,
    profileId: '30000000-0000-4000-8000-000000000001',
    state: lifecycleState,
    updatedAt: '2026-07-14T08:02:00.000Z',
    version: 2,
  });
  return { lifecycle, principal };
}

function apiWith(context: AuthenticatedPlayerContextV1) {
  const getAuthenticatedPlayer = jest.fn<
    NotificationDeviceApiRepository['getAuthenticatedPlayer']
  >(async () => context);
  const registerPushDevice = jest.fn<
    NotificationDeviceApiRepository['registerPushDevice']
  >(async ({ deviceInstallationId }) => ({
    deviceInstallationId,
    enabled: true,
    playerId:
      context.lifecycle?.playerId ?? PlayerIdSchema.parse(crypto.randomUUID()),
  }));
  const unregisterPushDevice = jest.fn<
    NotificationDeviceApiRepository['unregisterPushDevice']
  >(async () => true);
  const upsertPresence =
    jest.fn<NotificationDeviceApiRepository['upsertPresence']>();
  const api: NotificationDeviceApiRepository = {
    getAuthenticatedPlayer,
    registerPushDevice,
    unregisterPushDevice,
    upsertPresence,
  };
  return api;
}

function nativeGateway(
  overrides: Partial<PushNativeGateway> = {},
): PushNativeGateway {
  return {
    configureAndroidChannel: jest.fn<
      PushNativeGateway['configureAndroidChannel']
    >(async () => undefined),
    getExpoProjectId: jest.fn<PushNativeGateway['getExpoProjectId']>(
      () => 'project-id',
    ),
    getExpoPushToken: jest.fn<PushNativeGateway['getExpoPushToken']>(
      async () => 'ExponentPushToken[token-a]',
    ),
    getPermissionStatus: jest.fn<PushNativeGateway['getPermissionStatus']>(
      async () => 'granted',
    ),
    isPhysicalDevice: jest.fn<PushNativeGateway['isPhysicalDevice']>(
      () => true,
    ),
    platform: jest.fn<PushNativeGateway['platform']>(() => 'android'),
    requestPermission: jest.fn<PushNativeGateway['requestPermission']>(
      async () => 'granted',
    ),
    ...overrides,
  };
}

function service(
  context: AuthenticatedPlayerContextV1,
  native: PushNativeGateway = nativeGateway(),
) {
  const api = apiWith(context);
  const installationStore = new PushDeviceInstallationStore(
    () => 'device-installation-a',
    new MemoryInstallationStorage(),
  );
  return {
    api,
    native,
    service: new PushDeviceRegistrationService(
      api,
      installationStore,
      native,
      () => new Date('2026-07-14T08:30:00.000Z'),
    ),
  };
}

describe('PushDeviceRegistrationService', () => {
  it.each([
    'registered',
    'onboarding',
    'suspended',
    'deleting',
    'deleted',
  ] as const)(
    'never requests permission while lifecycle is %s',
    async (lifecycle) => {
      const setup = service(playerContext(lifecycle));

      await expect(setup.service.ensureRegistered(session)).resolves.toEqual({
        kind: 'lifecycle-ineligible',
        lifecycle,
      });
      expect(setup.native.getPermissionStatus).not.toHaveBeenCalled();
      expect(setup.native.requestPermission).not.toHaveBeenCalled();
      expect(setup.api.registerPushDevice).not.toHaveBeenCalled();
    },
  );

  it('rejects expired principal before touching native permission APIs', async () => {
    const setup = service(
      playerContext('active', { expiresAt: '2026-07-14T08:20:00.000Z' }),
    );

    await expect(setup.service.ensureRegistered(session)).resolves.toEqual({
      kind: 'principal-ineligible',
      reason: 'expired',
    });
    expect(setup.native.getPermissionStatus).not.toHaveBeenCalled();
  });

  it('rejects an unmapped principal before touching native APIs', async () => {
    const setup = service(playerContext('registered', { mapped: false }));

    await expect(setup.service.ensureRegistered(session)).resolves.toEqual({
      kind: 'principal-ineligible',
      reason: 'unmapped',
    });
    expect(setup.native.getPermissionStatus).not.toHaveBeenCalled();
  });

  it('fails closed when principal and lifecycle PlayerId disagree', async () => {
    const setup = service(playerContext('active', { mismatch: true }));

    await expect(setup.service.ensureRegistered(session)).rejects.toThrow(
      'Authenticated player identity contract mismatch',
    );
    expect(setup.native.getPermissionStatus).not.toHaveBeenCalled();
  });

  it('registers a physical active player with the stable installation ID', async () => {
    const setup = service(playerContext('active'));

    await expect(setup.service.ensureRegistered(session)).resolves.toEqual({
      deviceInstallationId: 'device-installation-a',
      kind: 'registered',
    });
    expect(setup.api.registerPushDevice).toHaveBeenCalledWith({
      deviceInstallationId: 'device-installation-a',
      expoPushToken: 'ExponentPushToken[token-a]',
      platform: 'android',
      session,
      signal: undefined,
    });
  });

  it('does not request permission or token on a simulator', async () => {
    const native = nativeGateway({
      isPhysicalDevice: jest.fn<PushNativeGateway['isPhysicalDevice']>(
        () => false,
      ),
    });
    const setup = service(playerContext('active'), native);

    await expect(setup.service.ensureRegistered(session)).resolves.toEqual({
      kind: 'not-physical-device',
    });
    expect(native.getPermissionStatus).not.toHaveBeenCalled();
    expect(native.getExpoPushToken).not.toHaveBeenCalled();
  });

  it('returns a configuration outcome when Expo projectId is absent', async () => {
    const native = nativeGateway({
      getExpoProjectId: jest.fn<PushNativeGateway['getExpoProjectId']>(
        () => null,
      ),
    });
    const setup = service(playerContext('active'), native);

    await expect(setup.service.ensureRegistered(session)).resolves.toEqual({
      kind: 'missing-project-id',
    });
    expect(native.requestPermission).not.toHaveBeenCalled();
  });

  it('requests undetermined permission once and stops on denial', async () => {
    const native = nativeGateway({
      getPermissionStatus: jest.fn<PushNativeGateway['getPermissionStatus']>(
        async () => 'undetermined',
      ),
      requestPermission: jest.fn<PushNativeGateway['requestPermission']>(
        async () => 'denied',
      ),
    });
    const setup = service(playerContext('active'), native);

    await expect(setup.service.ensureRegistered(session)).resolves.toEqual({
      kind: 'permission-denied',
    });
    expect(native.requestPermission).toHaveBeenCalledTimes(1);
    expect(native.getExpoPushToken).not.toHaveBeenCalled();
  });

  it('best-effort unregisters the stable installation on session cleanup', async () => {
    const setup = service(playerContext('active'));

    await expect(setup.service.unregister(session)).resolves.toBe(true);
    expect(setup.api.unregisterPushDevice).toHaveBeenCalledWith({
      deviceInstallationId: 'device-installation-a',
      session,
      signal: undefined,
    });
  });
});
