import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the startup readiness screen', async () => {
    const { getByText } = await render(<HomeScreen />);

    expect(getByText('Liqi Match')).toBeTruthy();
    expect(getByText('Expo SDK 56 project is ready')).toBeTruthy();
  });
});
