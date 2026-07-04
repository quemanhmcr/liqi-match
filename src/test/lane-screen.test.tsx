import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import LaneScreen from '@/app/lane';

describe('LaneScreen', () => {
  it('renders the lane selection step', async () => {
    const { getByText } = await render(<LaneScreen />);

    expect(getByText('Step 2/5')).toBeTruthy();
    expect(getByText('Choose your lanes')).toBeTruthy();
    expect(getByText('Jungle')).toBeTruthy();
    expect(getByText('Continue')).toBeTruthy();
  });
});
