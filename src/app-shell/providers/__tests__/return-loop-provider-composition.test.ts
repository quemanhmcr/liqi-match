import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

describe('return-loop provider composition', () => {
  it('runs auth before deep-link and push lifecycle orchestration', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/app-shell/providers/AppProviders.tsx'),
      'utf8',
    );
    const auth = source.indexOf('<AuthStateProvider>');
    const deepLink = source.indexOf('<DeepLinkCoordinatorProvider>');
    const push = source.indexOf('<PushDeviceLifecycleProvider>');
    const services = source.indexOf('<ApplicationServiceProviders');

    expect(auth).toBeGreaterThanOrEqual(0);
    expect(deepLink).toBeGreaterThan(auth);
    expect(push).toBeGreaterThan(deepLink);
    expect(services).toBeGreaterThan(push);
  });
});
