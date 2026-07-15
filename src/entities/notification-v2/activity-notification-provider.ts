import type {
  ActivityNotificationClickFactV2,
  ActivityNotificationReceiptV2,
  ActivityNotificationRequestV2,
} from '@/shared/contracts/core-v2';

export interface ActivityNotificationProviderV2 {
  request(
    input: ActivityNotificationRequestV2,
  ): Promise<ActivityNotificationReceiptV2>;
  recordClick(input: ActivityNotificationClickFactV2): Promise<void>;
}

export type ActivityNotificationDeliveryRuntimeV2 = Readonly<{
  canQueuePush(input: ActivityNotificationRequestV2): boolean;
}>;
