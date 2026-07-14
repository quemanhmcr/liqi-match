import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

/** Service-role adapter for authenticated Edge Function use cases. */

export function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createUserClient(accessToken: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonymousKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonymousKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  }

  return createClient(supabaseUrl, anonymousKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: { authorization: `Bearer ${accessToken}` },
    },
  });
}

export async function authenticateUser(accessToken: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Error('Invalid access token');
  }

  return { supabase, user: data.user };
}

type SupabaseServiceClient = ReturnType<typeof createServiceClient>;

type OutboxEventInput = {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload?: Record<string, unknown>;
};

export async function enqueueOutboxEvent(
  supabase: SupabaseServiceClient,
  input: OutboxEventInput,
) {
  const { data, error } = await supabase.rpc('enqueue_outbox_event', {
    p_aggregate_id: input.aggregateId,
    p_aggregate_type: input.aggregateType,
    p_event_type: input.eventType,
    p_payload: input.payload ?? {},
  });

  return { data: data as string | null, error };
}
