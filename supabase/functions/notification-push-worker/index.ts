import { createNotificationPushWorkerRuntimeHandler } from './runtime.ts';

Deno.serve(createNotificationPushWorkerRuntimeHandler());
