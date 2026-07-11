export type WorkerEnv = {
  R2_BUCKET: R2Bucket;
  MEDIA_QUEUE?: Queue;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_JWKS_URL: string;
  INTERNAL_WORKER_TOKEN?: string;
  MEDIA_ENV: string;
};
