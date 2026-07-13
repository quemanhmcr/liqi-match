import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import {
  DiscoverQueryState,
  DiscoverStaleBanner,
} from '../components/DiscoverQueryState';

describe('Discover query state matrix', () => {
  it('renders loading without an error', async () => {
    const screen = await render(
      <DiscoverQueryState error={null} onRetry={jest.fn()} />,
    );

    expect(screen.getByLabelText('Đang tải Khám phá')).toBeTruthy();
  });

  it('offers retry for an offline failure', async () => {
    const onRetry = jest.fn();
    const screen = await render(
      <DiscoverQueryState
        error={Object.assign(new Error('offline'), {
          code: 'offline',
          retryable: true,
        })}
        onRetry={onRetry}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Thử tải lại Khám phá'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Thiết bị đang offline/)).toBeTruthy();
  });

  it('does not offer retry for a non-retryable failure', async () => {
    const screen = await render(
      <DiscoverQueryState
        error={Object.assign(new Error('invalid'), {
          code: 'validation_failed',
          retryable: false,
        })}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Không thể tải Khám phá')).toBeTruthy();
    expect(screen.queryByLabelText('Thử tải lại Khám phá')).toBeNull();
  });

  it('renders the stale-data acceptance banner', async () => {
    const screen = await render(<DiscoverStaleBanner />);

    expect(
      screen.getByLabelText('Khám phá đang hiển thị dữ liệu cũ'),
    ).toBeTruthy();
  });
});
