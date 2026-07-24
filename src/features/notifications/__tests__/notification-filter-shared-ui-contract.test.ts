import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('notification filter shared UI contract', () => {
  it('delegates chip material and interaction states to the public shared UI', () => {
    const source = read(
      'src/features/notifications/components/NotificationFilterBar.tsx',
    );

    expect(source).toContain('AppChip');
    expect(source).toContain('density="compact"');
    expect(source).toContain('selected={selected}');
    expect(source).not.toContain('selectedGradient');
    expect(source).not.toContain('variant=');
    expect(source).not.toContain('withSheen');
    expect(source).not.toContain('Ionicons');
    expect(source).not.toContain('notificationsUi');
    expect(source).not.toContain('<Pressable');
  });
});
