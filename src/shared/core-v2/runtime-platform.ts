import type { CoreV2CommandAuditMetadata } from '@/shared/contracts/core-v2';

type AuditPlatform = CoreV2CommandAuditMetadata['platform'];

export function getRuntimeAuditPlatform(): AuditPlatform {
  return 'web';
}
