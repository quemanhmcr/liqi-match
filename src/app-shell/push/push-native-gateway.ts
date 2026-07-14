export type PushPermissionStatus = 'denied' | 'granted' | 'undetermined';
export type NativePushPlatform = 'android' | 'ios' | 'unsupported';

export interface PushNativeGateway {
  configureAndroidChannel(): Promise<void>;
  getExpoProjectId(): string | null;
  getExpoPushToken(projectId: string): Promise<string>;
  getPermissionStatus(): Promise<PushPermissionStatus>;
  isPhysicalDevice(): boolean;
  platform(): NativePushPlatform;
  requestPermission(): Promise<PushPermissionStatus>;
}
