import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import * as ImagePicker from 'expo-image-picker';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import ProfileMediaScreen from '@/features/onboarding/screens/ProfileMediaScreen';
import { runOnboardingMediaQueue } from '@/features/onboarding/services/onboarding-media-queue-service';
import { completeOnboardingProfile } from '@/features/onboarding/services/onboarding-profile-service';
import { usePersistedOnboardingDraftStore } from '@/features/onboarding/model/persisted-onboarding-draft';
import { renderWithProviders } from '@/test/render-with-providers';

import { onboardingEnvelope, testAccountId } from './onboarding-test-fixtures';

jest.mock(
  '@/features/onboarding/services/onboarding-media-queue-service',
  () => {
    const actual = jest.requireActual<
      typeof import('@/features/onboarding/services/onboarding-media-queue-service')
    >('@/features/onboarding/services/onboarding-media-queue-service');
    return { ...actual, runOnboardingMediaQueue: jest.fn() };
  },
);

jest.mock('@/features/onboarding/services/onboarding-profile-service', () => ({
  completeOnboardingProfile: jest.fn(async () => true),
}));

const mockCompleteOnboardingProfile = jest.mocked(completeOnboardingProfile);
const mockRunOnboardingMediaQueue = jest.mocked(runOnboardingMediaQueue);

describe('ProfileMediaScreen', () => {
  beforeEach(() => {
    mockCompleteOnboardingProfile.mockClear();
    mockRunOnboardingMediaQueue.mockReset();
    usePersistedOnboardingDraftStore.setState({
      accountId: testAccountId,
      envelope: onboardingEnvelope(),
      hydration: 'ready',
      hydrationError: null,
      persistenceError: null,
      source: 'persisted',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the full connected profile media step', async () => {
    const { getByText } = await renderWithProviders(<ProfileMediaScreen />);

    expect(getByText('Bước 6/6')).toBeTruthy();
    expect(getByText('Hoàn tất hồ sơ')).toBeTruthy();
    expect(getByText('Ảnh đại diện')).toBeTruthy();
    expect(getByText('Ảnh hồ sơ game')).toBeTruthy();
    expect(getByText('Tường ảnh')).toBeTruthy();
    expect(getByText('Tạo hồ sơ')).toBeTruthy();
    expect(getByText('Quay lại')).toBeTruthy();
  });

  it('opens the avatar source picker', async () => {
    const { getByLabelText, getByText } = await renderWithProviders(
      <ProfileMediaScreen />,
    );

    await fireEvent.press(getByLabelText('Chọn ảnh đại diện'));

    await waitFor(() => {
      expect(getByText('Thêm ảnh đại diện')).toBeTruthy();
    });
    expect(getByText('Chọn từ thư viện')).toBeTruthy();
    expect(getByText('Chụp ảnh mới')).toBeTruthy();
  });

  it('recovers a pending Android picker result into the persisted queue', async () => {
    jest.spyOn(ImagePicker, 'getPendingResultAsync').mockResolvedValueOnce({
      assets: [
        {
          assetId: null,
          base64: null,
          duration: null,
          exif: null,
          fileName: 'avatar.jpg',
          fileSize: 1024,
          height: 512,
          mimeType: 'image/jpeg',
          pairedVideoAsset: null,
          type: 'image',
          uri: 'file:///avatar.jpg',
          width: 512,
        },
      ],
      canceled: false,
    });
    usePersistedOnboardingDraftStore.setState({
      envelope: onboardingEnvelope({
        data: {
          ...onboardingEnvelope().data,
          pendingMediaSelection: { position: 0, slot: 'avatar' },
        },
      }),
    });

    await renderWithProviders(<ProfileMediaScreen />);

    await waitFor(() => {
      const data = usePersistedOnboardingDraftStore.getState().envelope?.data;
      expect(data?.pendingMediaSelection).toBeUndefined();
      expect(data?.mediaQueue?.[0]).toEqual(
        expect.objectContaining({
          localUri: 'file:///avatar.jpg',
          position: 0,
          slot: 'avatar',
          status: 'selected',
        }),
      );
    });
  });

  it('completes core profile then publishes completed without an artificial delay', async () => {
    const { getByText } = await renderWithProviders(<ProfileMediaScreen />);

    await act(async () => {
      await fireEvent.press(getByText('Tạo hồ sơ'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(usePersistedOnboardingDraftStore.getState().envelope?.status).toBe(
        'completed',
      );
    });
    expect(mockCompleteOnboardingProfile).toHaveBeenCalledTimes(1);
  });

  it('keeps media_pending when an upload fails after core completion', async () => {
    const failedItem = {
      localId: 'avatar:0:selected',
      localUri: 'file:///avatar.jpg',
      position: 0,
      slot: 'avatar' as const,
      status: 'selected' as const,
    };
    usePersistedOnboardingDraftStore.setState({
      envelope: onboardingEnvelope({
        data: {
          ...onboardingEnvelope().data,
          mediaQueue: [failedItem],
        },
      }),
    });
    mockRunOnboardingMediaQueue.mockImplementationOnce(
      async ({ onItemChange }) => {
        const errorItem = {
          ...failedItem,
          error: 'R2 unavailable',
          status: 'error' as const,
        };
        await onItemChange(errorItem);
        return { failed: [errorItem], items: [errorItem] };
      },
    );
    const { getByText } = await renderWithProviders(<ProfileMediaScreen />);

    await act(async () => {
      await fireEvent.press(getByText('Tạo hồ sơ'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(usePersistedOnboardingDraftStore.getState().envelope?.status).toBe(
        'media_pending',
      );
    });
    expect(mockCompleteOnboardingProfile).toHaveBeenCalledTimes(1);
  });

  it('does not call core completion again when resuming media_pending', async () => {
    const failedItem = {
      error: 'R2 unavailable',
      localId: 'avatar:0:failed',
      localUri: 'file:///avatar.jpg',
      position: 0,
      slot: 'avatar' as const,
      status: 'error' as const,
      uploadedAssetId: 'asset-1',
    };
    usePersistedOnboardingDraftStore.setState({
      envelope: onboardingEnvelope({
        data: {
          ...onboardingEnvelope().data,
          mediaQueue: [failedItem],
        },
        status: 'media_pending',
      }),
    });
    mockRunOnboardingMediaQueue.mockImplementationOnce(
      async ({ onItemChange }) => {
        const associated = {
          ...failedItem,
          error: undefined,
          status: 'associated' as const,
        };
        await onItemChange(associated);
        return { failed: [], items: [associated] };
      },
    );
    const { getByText } = await renderWithProviders(<ProfileMediaScreen />);

    await act(async () => {
      await fireEvent.press(getByText('Tạo hồ sơ'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(usePersistedOnboardingDraftStore.getState().envelope?.status).toBe(
        'completed',
      );
    });
    expect(mockCompleteOnboardingProfile).not.toHaveBeenCalled();
  });
});
