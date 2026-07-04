import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import HabitsScreen from '@/app/habits';

describe('HabitsScreen', () => {
  it('renders the connected habits step', async () => {
    const { getByText } = await render(<HabitsScreen />);

    expect(getByText('Step 4/5')).toBeTruthy();
    expect(getByText('Team habits')).toBeTruthy();
    expect(getByText('Comms')).toBeTruthy();
    expect(getByText('Voice when needed')).toBeTruthy();
    expect(getByText('Continue')).toBeTruthy();
  });
});
