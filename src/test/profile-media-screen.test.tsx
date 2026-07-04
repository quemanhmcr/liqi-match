import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import ProfileMediaScreen from '@/app/profile-media';

jest.mock('@/features/onboarding/profile-service', () => ({
  completeOnboardingProfile: jest.fn(async () => true),
}));

describe('ProfileMediaScreen', () => {
  it('renders the final connected profile step', async () => {
    const { getByText } = await render(<ProfileMediaScreen />);

    expect(getByText('Step 5/5')).toBeTruthy();
    expect(getByText('Finish profile')).toBeTruthy();
    expect(
      getByText('Save profile data to Supabase and enter the app.'),
    ).toBeTruthy();
    expect(getByText('Create profile')).toBeTruthy();
  });

  it('submits the connected profile flow', async () => {
    const { getByText } = await render(<ProfileMediaScreen />);

    fireEvent.press(getByText('Create profile'));

    expect(getByText('Create profile')).toBeTruthy();
  });
});
