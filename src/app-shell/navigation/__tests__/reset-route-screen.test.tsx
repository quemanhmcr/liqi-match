import { describe, expect, it } from '@jest/globals';

import { ResetRouteScreen } from '@/app-shell/navigation/ResetRouteScreen';
import { renderWithProviders } from '@/test/render-with-providers';

describe('ResetRouteScreen', () => {
  it('renders an intentionally blank, accessible rebuild host', async () => {
    const screen = await renderWithProviders(
      <ResetRouteScreen routeId="explore" />,
    );

    expect(screen.getByTestId('reset-route-explore')).toBeTruthy();
    expect(
      screen.getByLabelText('Route explore đã được reset để xây lại'),
    ).toBeTruthy();
    expect(screen.queryByRole('header')).toBeNull();
  });
});
