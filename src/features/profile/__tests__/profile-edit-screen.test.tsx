import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

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
import * as ImagePicker from 'expo-image-picker';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
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

describe('ProfileEditScreen', () => {
  it('does not expose region even when a legacy server region exists', async () => {
    const result = await renderWithProviders(<ProfileEditScreen />);

    expect(await result.findByText('Thông tin cá nhân')).toBeTruthy();
    expect(result.getByDisplayValue('Display Name')).toBeTruthy();
    expect(result.getByDisplayValue('IndependentHandle')).toBeTruthy();
    expect(result.queryByText('Khu vực')).toBeNull();
    expect(result.queryByText('Global')).toBeNull();
    expect(result.queryByText('VN')).toBeNull();
    expect(result.queryByText('SEA')).toBeNull();
    expect(result.queryByText('sea')).toBeNull();
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
