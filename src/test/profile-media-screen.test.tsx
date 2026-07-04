import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProfileMediaScreen from '@/app/profile-media';

jest.mock('@/features/onboarding/profile-service', () => ({
  completeOnboardingProfile: jest.fn(async () => true),
}));

describe('ProfileMediaScreen', () => {
  it('renders the full connected profile media step', async () => {
    const { getByText } = await render(<ProfileMediaScreen />);

    expect(getByText('Step 5/5')).toBeTruthy();
    expect(getByText('Finish profile')).toBeTruthy();
    expect(getByText('Avatar photo')).toBeTruthy();
    expect(getByText('Game profile photo')).toBeTruthy();
    expect(getByText('Photo wall')).toBeTruthy();
    expect(getByText('Create profile')).toBeTruthy();
  });

  it('opens the avatar source picker', async () => {
    const { getByLabelText, getByText } = await render(<ProfileMediaScreen />);

    fireEvent.press(getByLabelText('Choose avatar photo'));

    await waitFor(() => {
      expect(getByText('Add avatar photo')).toBeTruthy();
    });
    expect(getByText('Choose from library')).toBeTruthy();
    expect(getByText('Take photo')).toBeTruthy();
  });

  it('submits the connected profile flow', async () => {
    const { getByText } = await render(<ProfileMediaScreen />);

    fireEvent.press(getByText('Create profile'));

    expect(getByText('Create profile')).toBeTruthy();
  });
});
