import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import RankScreen from '@/app/rank';

describe('RankScreen', () => {
  it('renders the rank selection step', async () => {
    const { getAllByText, getByText } = await render(<RankScreen />);

    expect(getByText('1/5')).toBeTruthy();
    expect(getByText('mức rank')).toBeTruthy();
    expect(getAllByText('Cao Thủ').length).toBeGreaterThan(0);
    expect(getByText('Tiếp tục')).toBeTruthy();
  });
});
