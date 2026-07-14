import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type {
  NativePushPlatform,
  PushNativeGateway,
  PushPermissionStatus,
} from './push-native-gateway';

export class ExpoPushNativeGateway implements PushNativeGateway {
  configureAndroidChannel() {
    if (Platform.OS !== 'android') return Promise.resolve();
    return Notifications.setNotificationChannelAsync('default', {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: 'Thông báo',
      sound: 'default',
    }).then(() => undefined);
  }

  getExpoProjectId() {
    const easProjectId = Constants.easConfig?.projectId;
    if (typeof easProjectId === 'string' && easProjectId.trim()) {
      return easProjectId;
    }
    const configuredProjectId = readConfiguredProjectId(
      Constants.expoConfig?.extra,
    );
    return configuredProjectId;
  }

  async getExpoPushToken(projectId: string) {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  }

  async getPermissionStatus() {
    const permissions = await Notifications.getPermissionsAsync();
    return mapPermissionStatus(permissions.status);
  }

  isPhysicalDevice() {
    return Device.isDevice;
  }

  platform(): NativePushPlatform {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      return Platform.OS;
    }
    return 'unsupported';
  }

  async requestPermission() {
    const permissions = await Notifications.requestPermissionsAsync();
    return mapPermissionStatus(permissions.status);
  }
}

function mapPermissionStatus(
  status: Notifications.PermissionStatus,
): PushPermissionStatus {
  switch (status) {
    case Notifications.PermissionStatus.GRANTED:
      return 'granted';
    case Notifications.PermissionStatus.DENIED:
      return 'denied';
    default:
      return 'undetermined';
  }
}

function readConfiguredProjectId(extra: unknown) {
  if (!extra || typeof extra !== 'object') return null;
  const eas = (extra as Record<string, unknown>).eas;
  if (!eas || typeof eas !== 'object') return null;
  const projectId = (eas as Record<string, unknown>).projectId;
  return typeof projectId === 'string' && projectId.trim() ? projectId : null;
}
