import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  AppActionDock,
  AppNotice,
  AppPressableCard,
  AppTextField,
  appColors,
} from '@/shared/ui';

describe('shared form and flow primitives', () => {
  it('owns selectable-card accessibility and press behavior', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <AppPressableCard
        accessibilityLabel="Mở mục hồ sơ"
        onPress={onPress}
        selected
        withShadow={false}
      >
        <Text>Hồ sơ</Text>
      </AppPressableCard>,
    );

    const card = screen.getByLabelText('Mở mục hồ sơ');
    expect(card.props.accessibilityState).toMatchObject({
      disabled: false,
      selected: true,
    });
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps label, metadata, validation and input behavior in one field contract', async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <AppTextField
        accessibilityLabel="Tên hiển thị"
        errorText="Tên cần ít nhất 2 ký tự."
        label="Tên hiển thị"
        meta="1/20"
        onChangeText={onChangeText}
        value="L"
      />,
    );

    expect(screen.getByText('Tên hiển thị')).toBeTruthy();
    expect(screen.getByText('1/20')).toBeTruthy();
    expect(screen.getByText('Tên cần ít nhất 2 ký tự.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Tên hiển thị'), 'Linh');
    expect(onChangeText).toHaveBeenCalledWith('Linh');
  });

  it('exposes warning notices as polite alerts', async () => {
    const screen = await render(
      <AppNotice
        accessibilityLabel="Cảnh báo lưu"
        icon="warning-outline"
        title="Chưa lưu được"
        tone="warning"
      >
        Thử lại sau.
      </AppNotice>,
    );

    const notice = screen.getByLabelText('Cảnh báo lưu');
    expect(notice.props.accessibilityRole).toBe('alert');
    expect(notice.props.accessibilityLiveRegion).toBe('polite');
  });

  it('provides one safe-area dock surface for flow actions', async () => {
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 24, left: 0, right: 0, top: 0 },
        }}
      >
        <AppActionDock testID="action-dock">
          <View />
        </AppActionDock>
      </SafeAreaProvider>,
    );

    const dock = screen.getByTestId('action-dock');
    expect(StyleSheet.flatten(dock.props.style)).toMatchObject({
      backgroundColor: expect.any(String),
      borderTopColor: expect.any(String),
      paddingBottom: 24,
    });
    expect(StyleSheet.flatten(dock.props.style).borderTopColor).not.toBe(
      appColors.background.base,
    );
  });
});
