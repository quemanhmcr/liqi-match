import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text, TextInput } from 'react-native';

import {
  MESSAGE_INBOX_SEARCH_DEBOUNCE_MS,
  useMessageInboxSearchQuery,
} from '../model/message-inbox-search-query';

function SearchQueryProbe() {
  const state = useMessageInboxSearchQuery();
  return (
    <>
      <TextInput
        onChangeText={state.setInput}
        testID="search-query-input"
        value={state.input}
      />
      <Text testID="search-query-probe">
        {state.query}|{String(state.pending)}
      </Text>
      <Pressable accessibilityLabel="Clear probe" onPress={state.clear} />
    </>
  );
}

describe('message inbox search query', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('commits only the latest canonical input after the debounce window', async () => {
    const screen = await render(<SearchQueryProbe />);
    const input = screen.getByTestId('search-query-input');

    await fireEvent.changeText(input, 'K');
    await fireEvent.changeText(input, 'Kh');
    await fireEvent.changeText(input, '  Khoa  ');
    expect(screen.getByTestId('search-query-probe').props.children).toEqual([
      '',
      '|',
      'true',
    ]);

    await act(() => {
      jest.advanceTimersByTime(MESSAGE_INBOX_SEARCH_DEBOUNCE_MS - 1);
    });
    expect(screen.getByTestId('search-query-probe').props.children).toEqual([
      '',
      '|',
      'true',
    ]);

    await act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('search-query-probe').props.children).toEqual([
      'Khoa',
      '|',
      'false',
    ]);
  });

  it('clears input and canonical query synchronously', async () => {
    const screen = await render(<SearchQueryProbe />);
    await fireEvent.changeText(
      screen.getByTestId('search-query-input'),
      'Khoa',
    );
    await act(() => {
      jest.advanceTimersByTime(MESSAGE_INBOX_SEARCH_DEBOUNCE_MS);
    });

    await fireEvent.press(screen.getByLabelText('Clear probe'));
    expect(screen.getByTestId('search-query-input').props.value).toBe('');
    expect(screen.getByTestId('search-query-probe').props.children).toEqual([
      '',
      '|',
      'false',
    ]);
  });
});
