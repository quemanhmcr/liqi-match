import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MessageInboxSearchHeader } from '../components/MessageInboxSearchHeader';

const geometryCases: [
  layout: string,
  compact: boolean,
  backActionSize: number,
  headerMinHeight: number,
][] = [
  ['regular', false, 48, 72],
  ['compact', true, 44, 66],
];

describe('MessageInboxSearchHeader', () => {
  it.each(geometryCases)(
    'keeps %s search mode focused and touch-safe',
    async (_layout, compact, backActionSize, headerMinHeight) => {
      const screen = await render(
        <MessageInboxSearchHeader
          compact={compact}
          onCancel={jest.fn()}
          onChangeQuery={jest.fn()}
          query=""
        />,
      );

      expect(screen.getByTestId('messages-search-input').props.autoFocus).toBe(
        true,
      );
      expect(
        StyleSheet.flatten(
          screen.getByTestId('messages-search-header').props.style,
        ),
      ).toMatchObject({ minHeight: headerMinHeight });
      expect(
        StyleSheet.flatten(
          screen.getByTestId('messages-search-back-action').props.style,
        ),
      ).toMatchObject({ height: backActionSize, width: backActionSize });
    },
  );

  it('shows restrained progress without replacing the input', async () => {
    const screen = await render(
      <MessageInboxSearchHeader
        busy
        compact={false}
        onCancel={jest.fn()}
        onChangeQuery={jest.fn()}
        query="Khoa"
      />,
    );

    expect(screen.getByTestId('messages-search-progress')).toBeTruthy();
    expect(screen.getByTestId('messages-search-input').props.value).toBe(
      'Khoa',
    );
  });

  it('clears the controlled query without leaving search mode', async () => {
    const onChangeQuery = jest.fn();
    const screen = await render(
      <MessageInboxSearchHeader
        compact={false}
        onCancel={jest.fn()}
        onChangeQuery={onChangeQuery}
        query="Khoa"
      />,
    );

    await fireEvent.press(screen.getByLabelText('Xoá tìm kiếm'));
    expect(onChangeQuery).toHaveBeenCalledWith('');
    expect(screen.getByTestId('messages-search-header')).toBeTruthy();
  });
});
