import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { ProfileEditScreen } from '@/features/profile/screens/ProfileEditScreen';
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
  return {
    availabilitySlots: [],
    form: {
      availability: { presets: ['Tối'] },
      gameProfile: {
        handle: 'IndependentHandle',
        rankId: undefined,
      },
      habits: {},
      heroes: [],
      identity: {
        bio: 'Bio',
        displayName: 'Display Name',
      },
      lanes: { roleIds: [] },
      media: {
        avatarMediaId: null,
        coverMediaId: null,
        staged: {},
      },
    },
    heroOptions: [],
    id: testAuthSession.user.id,
    mediaSummary: {},
    meta: {
      hasGameProfileRecord: true,
      hasHabitRecord: true,
      serverRegion: 'sea',
    },
    ranks: [],
    roles: [],
  };
}
