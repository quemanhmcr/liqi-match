import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';

import {
  scrollToProfilePlayStyleAnchor,
  type ProfileEditScrollAnchor,
  type ProfileEditScrollContainer,
} from '@/features/profile/edit/components/profile-play-style-scroll';
import { ProfileEditScreen } from '@/features/profile/screens/ProfileEditScreen';
import {
  makeProfileEditDraft,
  makeProfileEditForm,
} from './profile-edit-test-fixtures';
import {
  clearPendingProfileMediaSlot,
  consumePendingProfileMediaSlot,
  persistProfileMediaDraftItem,
  rememberPendingProfileMediaSlot,
  restoreProfileMediaDraft,
} from '@/features/profile/edit/model/profile-media-picker-recovery';
import { saveProfileEditChanges } from '@/features/profile/edit/services/profile-edit-coordinator';
import { fetchProfileEditDraft } from '@/features/profile/edit/services/profile-edit-read-service';
import {
  renderWithProviders,
  testAuthSession,
} from '@/test/render-with-providers';
import { appSpacing } from '@/shared/ui';
import * as ImagePicker from 'expo-image-picker';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn(),
  },
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-image-picker', () => ({
  getPendingResultAsync: jest.fn(async () => null),
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({
    granted: true,
  })),
}));

jest.mock('@/features/profile/edit/services/profile-edit-read-service', () => ({
  fetchProfileEditDraft: jest.fn(),
}));

jest.mock('@/features/profile/edit/services/profile-edit-coordinator', () => ({
  saveProfileEditChanges: jest.fn(),
}));

jest.mock(
  '@/features/profile/edit/model/profile-media-picker-recovery',
  () => ({
    clearPendingProfileMediaSlot: jest.fn(async () => undefined),
    clearProfileMediaDraftItem: jest.fn(async () => undefined),
    consumePendingProfileMediaSlot: jest.fn(async () => undefined),
    persistProfileMediaDraftItem: jest.fn(async (_profileId, item) => item),
    rememberPendingProfileMediaSlot: jest.fn(async () => undefined),
    restoreProfileMediaDraft: jest.fn(async () => ({})),
  }),
);

const mockFetchDraft = jest.mocked(fetchProfileEditDraft);
const mockSaveChanges = jest.mocked(saveProfileEditChanges);
const mockPersistMedia = jest.mocked(persistProfileMediaDraftItem);
const mockRestoreMedia = jest.mocked(restoreProfileMediaDraft);
const mockConsumePending = jest.mocked(consumePendingProfileMediaSlot);
const mockRememberPending = jest.mocked(rememberPendingProfileMediaSlot);
const mockClearPending = jest.mocked(clearPendingProfileMediaSlot);
const mockLaunchPicker = jest.mocked(ImagePicker.launchImageLibraryAsync);

beforeEach(() => {
  for (const mock of [
    mockFetchDraft,
    mockSaveChanges,
    mockPersistMedia,
    mockRestoreMedia,
    mockConsumePending,
    mockRememberPending,
    mockClearPending,
    mockLaunchPicker,
  ]) {
    mock.mockClear();
  }
  mockFetchDraft.mockResolvedValue(profileDraft());
  mockRestoreMedia.mockResolvedValue({});
  mockConsumePending.mockResolvedValue(undefined);
  mockPersistMedia.mockImplementation(async (_profileId, item) => item);
});

describe('Profile play-style semantic scrolling', () => {
  it('measures the selected anchor against the native content ref before scrolling', () => {
    const contentRef = { kind: 'profile-edit-scroll-content-ref' };
    const scrollTo = jest.fn();
    const getInnerViewRef = jest.fn(() => contentRef);
    const measureLayout = jest.fn(
      (
        relativeToNativeComponentRef: unknown,
        onSuccess: (
          x: number,
          y: number,
          width: number,
          height: number,
        ) => void,
      ) => {
        expect(relativeToNativeComponentRef).toBe(contentRef);
        onSuccess(0, 640, 320, 280);
      },
    );

    expect(
      scrollToProfilePlayStyleAnchor(
        { getInnerViewRef, scrollTo } as unknown as ProfileEditScrollContainer,
        { measureLayout } as unknown as ProfileEditScrollAnchor,
      ),
    ).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({
      animated: true,
      y: 640 - appSpacing['4xl'],
    });
  });
});

describe('ProfileEditScreen', () => {
  it('does not expose region even when a legacy server region exists', async () => {
    const result = await renderWithProviders(<ProfileEditScreen />);

    expect(await result.findByText('Thông tin cá nhân')).toBeTruthy();
    expect(result.getByDisplayValue('Display Name')).toBeTruthy();
    expect(result.queryByDisplayValue('IndependentHandle')).toBeNull();

    await act(async () => {
      await fireEvent.press(result.getByLabelText('Mở mục Trong game'));
    });

    expect(result.getByDisplayValue('IndependentHandle')).toBeTruthy();
    expect(result.queryByText('Thông tin cá nhân')).toBeNull();
    expect(result.queryByText('Khu vực')).toBeNull();
    expect(result.queryByText('Global')).toBeNull();
    expect(result.queryByText('VN')).toBeNull();
    expect(result.queryByText('SEA')).toBeNull();
    expect(result.queryByText('sea')).toBeNull();
  });

  it('opens the requested play-style category with explainable live outcomes', async () => {
    const result = await renderWithProviders(
      <ProfileEditScreen initialCategory="playStyle" />,
    );

    expect(await result.findByText('Phong cách chơi')).toBeTruthy();
    expect(result.queryByText('Thông tin cá nhân')).toBeNull();
    expect(result.getByTestId('profile-play-style-edit-preview')).toBeTruthy();
    expect(
      result.queryByTestId('profile-play-style-change-preview', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(result.getByText('HỒ SƠ SẼ HIỂN THỊ')).toBeTruthy();
    expect(result.getByText('THIẾT LẬP BA THẺ')).toBeTruthy();
    expect(result.getByText('MỤC TIÊU CHƠI')).toBeTruthy();
    expect(result.getByText('CÁCH PHỐI HỢP')).toBeTruthy();
    expect(result.getByText('BẢN SẮC CHIẾN THUẬT')).toBeTruthy();
    expect(result.getByText('THÓI QUEN GIÚP GHÉP ĐỘI')).toBeTruthy();

    const goalPreview = within(
      result.getByTestId('profile-play-style-edit-preview-goal'),
    );
    const coordinationPreview = within(
      result.getByTestId('profile-play-style-edit-preview-coordination'),
    );
    const tacticsPreview = within(
      result.getByTestId('profile-play-style-edit-preview-tactics'),
    );
    expect(goalPreview.getByText('Leo rank nghiêm túc')).toBeTruthy();
    expect(coordinationPreview.getByText('Giao tiếp đúng lúc')).toBeTruthy();
    expect(tacticsPreview.getByText('Chưa chọn chiến thuật')).toBeTruthy();
    expect(
      result.getByTestId('profile-play-style-edit-source-goal').props.children,
    ).toBe('Tự động từ: Leo rank nghiêm túc');
    expect(
      result.getByTestId('profile-play-style-edit-source-coordination').props
        .children,
    ).toBe('Tự động từ: Voice khi cần');
    expect(
      result.getByTestId('profile-play-style-edit-anchor-goal').props
        .collapsable,
    ).toBe(false);
    expect(
      result.getByTestId('profile-play-style-edit-anchor-coordination').props
        .collapsable,
    ).toBe(false);
    expect(
      result.getByTestId('profile-play-style-edit-anchor-tactics').props
        .collapsable,
    ).toBe(false);

    await act(async () => {
      await fireEvent.press(
        result.getByLabelText(
          'Đi đến cài đặt Mục tiêu chơi: Leo rank nghiêm túc',
        ),
      );
    });

    await act(async () => {
      await fireEvent.press(
        result.getByLabelText('Chiến thuật Bảo kê và hỗ trợ đồng đội'),
      );
    });

    expect(
      within(
        result.getByTestId('profile-play-style-edit-preview-tactics'),
      ).getByText('Bảo kê đồng đội', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      result.getByTestId('profile-play-style-edit-source-tactics').props
        .children,
    ).toBe('Tự động từ: Bảo kê và hỗ trợ đồng đội');
    expect(
      within(
        result.getByTestId('profile-play-style-change-preview-tactics', {
          includeHiddenElements: true,
        }),
      ).getByText('Bảo kê đồng đội', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      result.getByText(
        'Các lựa chọn dưới đây giúp đánh giá độ hợp nhau; chúng không tự đổi ba thẻ minh hoạ phía trên.',
      ),
    ).toBeTruthy();
  });

  it('reviews only real archetype changes and dismisses the artwork automatically', async () => {
    const result = await renderWithProviders(
      <ProfileEditScreen initialCategory="playStyle" />,
    );
    await result.findByText('Phong cách chơi');

    await act(async () => {
      await fireEvent.press(
        result.getByLabelText('Giao tiếp Ping/chat là chính'),
      );
    });
    expect(
      result.queryByTestId('profile-play-style-change-preview', {
        includeHiddenElements: true,
      }),
    ).toBeNull();

    await act(async () => {
      await fireEvent.press(
        result.getByLabelText('Chiến thuật Bảo kê và hỗ trợ đồng đội'),
      );
    });
    const changePreview = within(
      result.getByTestId('profile-play-style-change-preview-tactics', {
        includeHiddenElements: true,
      }),
    );
    expect(
      changePreview.getByText('CHIẾN THUẬT ĐÃ CẬP NHẬT', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      changePreview.getByText('Bảo kê đồng đội', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      changePreview.queryByText('Bản xem trước vừa cập nhật', {
        includeHiddenElements: true,
      }),
    ).toBeNull();

    await waitFor(
      () =>
        expect(
          result.queryByTestId('profile-play-style-change-preview', {
            includeHiddenElements: true,
          }),
        ).toBeNull(),
      { timeout: 3000 },
    );
  });

  it('uses the latest profile version after a partial save', async () => {
    const firstDraft = profileDraft();
    const firstForm = structuredClone(firstDraft.form);
    firstForm.identity.displayName = 'Saved identity';
    mockSaveChanges
      .mockResolvedValueOnce({
        baseline: firstForm,
        failedSection: 'lanes',
        form: firstForm,
        outcome: 'partially-saved',
        profileVersion: 3,
        retrySections: ['lanes'],
        savedSections: ['identity'],
        steps: [
          { id: 'identity', status: 'saved' },
          { error: 'Lane failed', id: 'lanes', status: 'failed' },
        ],
        uploadedButUnassociated: [],
      })
      .mockResolvedValueOnce({
        baseline: firstForm,
        form: firstForm,
        outcome: 'saved',
        profileVersion: 3,
        retrySections: [],
        savedSections: ['lanes'],
        steps: [{ id: 'lanes', status: 'saved' }],
        uploadedButUnassociated: [],
      });
    const result = await renderWithProviders(<ProfileEditScreen />);
    await result.findByText('Thông tin cá nhân');

    await act(async () => {
      await fireEvent.changeText(
        result.getByDisplayValue('Display Name'),
        'Saved identity',
      );
    });
    await waitFor(() => {
      expect(
        result.getByLabelText('Lưu hồ sơ').props.accessibilityState?.disabled ??
          result.getByLabelText('Lưu hồ sơ').props.disabled,
      ).toBeFalsy();
    });
    await act(async () => {
      await fireEvent.press(result.getByLabelText('Lưu hồ sơ'));
    });
    await waitFor(() => {
      expect(mockSaveChanges).toHaveBeenCalledTimes(1);
      expect(result.getByLabelText('Thử lưu lại phần thất bại')).toBeTruthy();
    });

    await act(async () => {
      await fireEvent.press(result.getByLabelText('Thử lưu lại phần thất bại'));
    });

    await waitFor(() => {
      expect(mockSaveChanges).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ profileVersion: 3 }),
      );
    });
  });

  it('stages a selected image without starting save or upload coordination', async () => {
    mockLaunchPicker.mockResolvedValueOnce({
      assets: [
        {
          assetId: 'picker-asset',
          fileName: 'avatar.jpg',
          fileSize: 1024,
          height: 512,
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///cache/avatar.jpg',
          width: 512,
        },
      ],
      canceled: false,
    });
    const result = await renderWithProviders(<ProfileEditScreen />);
    await result.findByText('Thông tin cá nhân');

    await act(async () => {
      await fireEvent.press(result.getByLabelText('Đổi ảnh đại diện'));
    });

    await waitFor(() => {
      expect(result.getByText('Sẵn sàng upload khi lưu')).toBeTruthy();
    });
    expect(mockRememberPending).toHaveBeenCalledWith('avatar');
    expect(mockPersistMedia).toHaveBeenCalledWith(
      testAuthSession.user.id,
      expect.objectContaining({
        slot: 'avatar',
        status: 'ready',
      }),
    );
    expect(mockSaveChanges).not.toHaveBeenCalled();
  });

  it('preserves a partial availability selection across category switches until a matching time is chosen', async () => {
    const result = await renderWithProviders(<ProfileEditScreen />);
    await result.findByText('Thông tin cá nhân');

    await act(async () => {
      await fireEvent.press(result.getByLabelText('Mở mục Lịch chơi'));
    });
    await result.findByText('Thời gian thường chơi');
    await act(async () => {
      await fireEvent.press(result.getByLabelText('Ngày trong tuần T2'));
    });
    expect(
      result.getByLabelText('Ngày trong tuần T2').props.accessibilityState
        ?.selected,
    ).toBe(true);

    await act(async () => {
      await fireEvent.press(result.getByLabelText('Mở mục Hồ sơ'));
      await fireEvent.press(result.getByLabelText('Mở mục Lịch chơi'));
    });
    expect(
      result.getByLabelText('Ngày trong tuần T2').props.accessibilityState
        ?.selected,
    ).toBe(true);

    await act(async () => {
      await fireEvent.press(result.getByLabelText('Khung giờ Tối'));
    });

    expect(result.getByText('Lịch sẽ được lưu')).toBeTruthy();
    expect(
      result.getByLabelText('Lưu hồ sơ').props.accessibilityState?.disabled ??
        result.getByLabelText('Lưu hồ sơ').props.disabled,
    ).toBeFalsy();
  });
});

function profileDraft() {
  const form = makeProfileEditForm();
  form.availability = null;
  form.gameProfile = {
    handle: 'IndependentHandle',
    rankId: null,
  };
  form.heroes = [];
  form.identity = {
    bio: 'Bio',
    displayName: 'Display Name',
    genderId: null,
  };
  form.laneSelection = null;
  form.media = {
    avatarMediaId: null,
    coverMediaId: null,
    staged: {},
  };
  return makeProfileEditDraft(form, testAuthSession.user.id);
}
