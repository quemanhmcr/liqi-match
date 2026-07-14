import { randomUUID } from 'expo-crypto';

import { ApiNotificationDeviceRepository } from './notification-device-api.repository';
import { ExpoNotificationPresentationController } from './expo-notification-presentation-controller';
import { ExpoPushNativeGateway } from './expo-push-native-gateway';
import { NotificationPresenceService } from './notification-presence-service';
import { PushDeviceInstallationStore } from './push-device-installation-store';
import { PushDeviceRegistrationService } from './push-device-registration-service';

const api = new ApiNotificationDeviceRepository();
const installationStore = new PushDeviceInstallationStore(randomUUID);

export const pushDeviceRegistrationService = new PushDeviceRegistrationService(
  api,
  installationStore,
  new ExpoPushNativeGateway(),
);
export const notificationPresenceService = new NotificationPresenceService(api);
export const notificationPresentationController =
  new ExpoNotificationPresentationController();
