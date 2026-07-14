import type { AuthSession } from '@/shared/auth/auth-service';
import {
  isPrincipalExpired,
  type PlayerLifecycleStateV1,
} from '@/shared/contracts/core-v1';

import type { NotificationDeviceApiRepository } from './notification-device-api.repository';
import type { PushDeviceInstallationStore } from './push-device-installation-store';
import type { PushNativeGateway } from './push-native-gateway';

export type PushDeviceRegistrationOutcome =
  | Readonly<{ kind: 'registered'; deviceInstallationId: string }>
  | Readonly<{ kind: 'permission-denied' }>
  | Readonly<{ kind: 'not-physical-device' }>
  | Readonly<{ kind: 'unsupported-platform' }>
  | Readonly<{ kind: 'missing-project-id' }>
  | Readonly<{
      kind: 'principal-ineligible';
      reason: 'expired' | 'unmapped';
    }>
  | Readonly<{
      kind: 'lifecycle-ineligible';
      lifecycle: PlayerLifecycleStateV1;
    }>;

export class PushDeviceRegistrationService {
  constructor(
    private readonly api: NotificationDeviceApiRepository,
    private readonly installationStore: PushDeviceInstallationStore,
    private readonly native: PushNativeGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ensureRegistered(
    session: AuthSession,
    signal?: AbortSignal,
  ): Promise<PushDeviceRegistrationOutcome> {
    const context = await this.api.getAuthenticatedPlayer(session, signal);
    if (isPrincipalExpired(context.principal, this.now())) {
      return { kind: 'principal-ineligible', reason: 'expired' };
    }
    if (!context.principal.playerId || !context.lifecycle) {
      return { kind: 'principal-ineligible', reason: 'unmapped' };
    }
    if (context.lifecycle.playerId !== context.principal.playerId) {
      throw new Error('Authenticated player identity contract mismatch.');
    }
    if (context.lifecycle.state !== 'active') {
      return {
        kind: 'lifecycle-ineligible',
        lifecycle: context.lifecycle.state,
      };
    }

    if (!this.native.isPhysicalDevice()) return { kind: 'not-physical-device' };
    const platform = this.native.platform();
    if (platform === 'unsupported') return { kind: 'unsupported-platform' };

    const projectId = this.native.getExpoProjectId();
    if (!projectId) return { kind: 'missing-project-id' };

    await this.native.configureAndroidChannel();
    let permission = await this.native.getPermissionStatus();
    if (permission === 'undetermined') {
      permission = await this.native.requestPermission();
    }
    if (permission !== 'granted') return { kind: 'permission-denied' };

    const [deviceInstallationId, expoPushToken] = await Promise.all([
      this.installationStore.getOrCreate(),
      this.native.getExpoPushToken(projectId),
    ]);
    await this.api.registerPushDevice({
      deviceInstallationId,
      expoPushToken,
      platform,
      session,
      signal,
    });
    return { deviceInstallationId, kind: 'registered' };
  }

  async unregister(
    session: AuthSession,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const deviceInstallationId = await this.installationStore.getOrCreate();
    return this.api.unregisterPushDevice({
      deviceInstallationId,
      session,
      signal,
    });
  }
}
