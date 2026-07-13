import { describe, expect, it } from '@jest/globals';

import {
  applySavedProfileEditSections,
  cloneProfileEditForm,
  getDirtyProfileEditSections,
} from '../edit/model/profile-edit-model';
import { makeProfileEditForm } from './profile-edit-test-fixtures';

describe('Profile Edit dirty sections', () => {
  it('marks only identity dirty and preserves lane and hero priority', () => {
    const baseline = makeProfileEditForm();
    const current = cloneProfileEditForm(baseline);
    current.identity.displayName = 'New Display Name';

    expect(getDirtyProfileEditSections(baseline, current)).toEqual([
      'identity',
    ]);

    const nextBaseline = applySavedProfileEditSections(baseline, current, [
      'identity',
    ]);
    expect(nextBaseline.laneSelection).toEqual({
      primary: 'jungle',
      secondary: 'support',
    });
    expect(nextBaseline.heroes).toEqual([
      { heroId: 'edras', priority: 1 },
      { heroId: 'goverra', priority: 2 },
      { heroId: 'heino', priority: 3 },
    ]);
  });

  it('marks only habits dirty when one canonical answer changes', () => {
    const baseline = makeProfileEditForm();
    const current = cloneProfileEditForm(baseline);
    current.habits.seriousnessId = 'seriousness.competitive';

    expect(getDirtyProfileEditSections(baseline, current)).toEqual(['habits']);
    expect(current.habits.communicationPreferenceIds).toEqual([
      'communication.voice-as-needed',
    ]);
    expect(current.laneSelection).toEqual(baseline.laneSelection);
  });
});
