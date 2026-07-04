import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import HabitsScreen from '@/app/habits';

describe('HabitsScreen', () => {
  it('renders the full connected habits step', async () => {
    const { getAllByText, getByText } = await render(<HabitsScreen />);

    expect(getByText('Step 4/5')).toBeTruthy();
    expect(getByText('Team habits')).toBeTruthy();
    expect(getByText('Communication')).toBeTruthy();
    expect(getAllByText(/Ping\/chat/).length).toBeGreaterThan(0);
    expect(getByText('Strategy style')).toBeTruthy();
    expect(getByText('Team atmosphere')).toBeTruthy();
    expect(getByText('Continue')).toBeTruthy();
  });
});
