import { describe, expect, it } from '@jest/globals';

import {
  applySavedProfileEditSections,
  cloneProfileEditForm,
  getDirtyProfileEditSections,
  type ProfileEditForm,
} from '../edit/model/profile-edit-model';

function makeForm(): ProfileEditForm {
  return {
    availability: { presets: ['Tối'] },
    gameProfile: { handle: 'GameHandle', rankId: 'rank-1' },
    habits: {
      communication_channels: ['Voice khi cần'],
      seriousness: 'Cân bằng',
    },
    heroes: [
      { heroId: 'hero-1', name: 'Aya', slug: 'aya' },
      { heroId: 'hero-2', name: 'Helen', slug: 'helen' },
      { heroId: 'hero-3', name: 'Alice', slug: 'alice' },
    ],
    identity: { bio: 'Bio', displayName: 'Display Name' },
    lanes: { roleIds: ['primary-lane', 'secondary-lane'] },
    media: {
      avatarMediaId: 'avatar-1',
      coverMediaId: 'cover-1',
      staged: {},
    },
  };
}

describe('Profile Edit dirty sections', () => {
  it('marks only identity dirty and preserves lane and hero ordering', () => {
    const baseline = makeForm();
    const current = cloneProfileEditForm(baseline);
    current.identity.displayName = 'New Display Name';

    expect(getDirtyProfileEditSections(baseline, current)).toEqual([
      'identity',
    ]);

    const nextBaseline = applySavedProfileEditSections(baseline, current, [
      'identity',
    ]);
    expect(nextBaseline.lanes.roleIds).toEqual([
      'primary-lane',
      'secondary-lane',
    ]);
    expect(nextBaseline.heroes.map((hero) => hero.heroId)).toEqual([
      'hero-1',
      'hero-2',
      'hero-3',
    ]);
  });

  it('marks only habits dirty when one answer changes', () => {
    const baseline = makeForm();
    const current = cloneProfileEditForm(baseline);
    current.habits.seriousness = 'Cạnh tranh';

    expect(getDirtyProfileEditSections(baseline, current)).toEqual(['habits']);
    expect(current.habits.communication_channels).toEqual(['Voice khi cần']);
    expect(current.lanes.roleIds).toEqual(baseline.lanes.roleIds);
  });
});
