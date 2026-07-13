export const applicationRuntimeModes = ['simulation', 'api'] as const;

export type ApplicationRuntimeMode = (typeof applicationRuntimeModes)[number];

export function parseApplicationRuntimeMode(
  value: string | undefined,
): ApplicationRuntimeMode {
  if (value === 'simulation' || value === 'api') return value;

  throw new Error(
    `Invalid application runtime mode "${value ?? ''}". Expected simulation or api.`,
  );
}
