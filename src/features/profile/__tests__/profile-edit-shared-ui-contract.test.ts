import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('Profile Edit shared UI contract', () => {
  it('uses canonical shared behavior instead of rebuilding general controls', () => {
    const experience = read(
      'src/features/profile/edit/components/ProfileEditExperience.tsx',
    );
    const chrome = read(
      'src/features/profile/edit/components/ProfileEditExperienceChrome.tsx',
    );
    const primitives = read(
      'src/features/profile/edit/components/ProfileEditFormPrimitives.tsx',
    );
    const saveBanner = read(
      'src/features/profile/edit/components/ProfileEditSaveBanner.tsx',
    );

    expect(experience).toContain('AppTextField');
    expect(experience).toContain('AppPressableCard');
    expect(experience).toContain('AppNotice');
    expect(experience).not.toContain('<TextInput');
    expect(experience).not.toContain('<Pressable');
    expect(experience).not.toContain('useSafeAreaInsets');

    expect(chrome).toContain('AppIdentityHeader');
    expect(chrome).toContain('AppActionDock');
    expect(primitives).toContain('AppCard');
    expect(primitives).toContain('AppChip');
    expect(saveBanner).toContain('AppNotice');
  });

  it('shares the full-screen action dock with Profile Share', () => {
    const share = read('src/features/profile/screens/ProfileShareScreen.tsx');
    const sharedIndex = read('src/shared/ui/index.ts');

    expect(share).toContain('AppActionDock');
    expect(share).not.toContain('useSafeAreaInsets');
    expect(sharedIndex).toContain('AppActionDock');
    expect(sharedIndex).toContain('AppTextField');
    expect(sharedIndex).toContain('AppNotice');
    expect(sharedIndex).toContain('AppPressableCard');
  });
});
