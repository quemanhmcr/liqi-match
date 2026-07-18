import registry from '../../../config/supabase-projects.json';

export const publicBackendTargets = [
  'local-simulation',
  'staging-runtime',
  'production-runtime',
] as const;

export type PublicBackendTarget = (typeof publicBackendTargets)[number];

export const backendProjects = Object.freeze({
  stagingRuntime: Object.freeze({
    ...registry.projects['staging-runtime'],
    target: 'staging-runtime' as const,
  }),
  e2eDisposable: Object.freeze({
    ...registry.projects['e2e-disposable'],
    target: 'e2e-disposable' as const,
  }),
});

export function projectNameForRuntimeTarget(
  target: PublicBackendTarget,
): string {
  switch (target) {
    case 'local-simulation':
      return 'local-supabase';
    case 'staging-runtime':
      return backendProjects.stagingRuntime.projectName;
    case 'production-runtime':
      return 'production-explicit';
  }
}
