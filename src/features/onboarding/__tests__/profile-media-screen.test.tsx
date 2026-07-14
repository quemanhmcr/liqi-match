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

import {
  createOnboardingMediaQueueItem,
  type OnboardingMediaQueueItem,
} from '@/features/onboarding/model/onboarding-media-queue';
import { usePersistedOnboardingDraftStore } from '@/features/onboarding/model/persisted-onboarding-draft';
import ProfileMediaScreen from '@/features/onboarding/screens/ProfileMediaScreen';
import { runOnboardingMediaQueue } from '@/features/onboarding/services/onboarding-media-queue-service';
import { completeOnboardingProfile } from '@/features/onboarding/services/onboarding-profile-service';
import { synchronizeAuthSession } from '@/shared/auth/auth-service';
import {
  createTestAuthSession,
  renderWithProviders,
  testOnboardingAuthSession,
} from '@/test/render-with-providers';

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

jest.mock('@/shared/auth/auth-service', () => {
  const actual = jest.requireActual<
    typeof import('@/shared/auth/auth-service')
  >('@/shared/auth/auth-service');
  return { ...actual, synchronizeAuthSession: jest.fn() };
});

jest.mock('@/features/onboarding/services/onboarding-profile-service', () => ({
  completeOnboardingProfile: jest.fn(),
}));

const mockCompleteOnboardingProfile = jest.mocked(completeOnboardingProfile);
const mockSynchronizeAuthSession = jest.mocked(synchronizeAuthSession);
const mockRunOnboardingMediaQueue = jest.mocked(runOnboardingMediaQueue);
const activeSession = createTestAuthSession({ lifecycleState: 'active' });

function renderScreen(session = testOnboardingAuthSession) {
  return renderWithProviders(<ProfileMediaScreen />, { session });
}

describe('ProfileMediaScreen', () => {
  beforeEach(() => {
    mockCompleteOnboardingProfile.mockReset().mockResolvedValue({
      completed: true,
      profileVersion: 1,
      repeated: false,
      session: testOnboardingAuthSession,
      warnings: [
        {
          code: 'lane_priority_not_persisted',
          message: 'Current backend does not persist lane priority.',
          path: 'laneSelection',
          severity: 'warning',
        },
      ],
    });
    mockSynchronizeAuthSession.mockReset().mockResolvedValue(activeSession);
    mockRunOnboardingMediaQueue.mockReset();
    usePersistedOnboardingDraftStore.setState({
      accountId: testAccountId,
      envelope: onboardingEnvelope(),
      hydration: 'ready',
      hydrationError: null,
      migrationIssues: [],
      persistenceError: null,
      source: 'persisted',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the full connected profile media step', async () => {
    const { getByText } = await renderScreen();

    expect(getByText('Bước 6/6')).toBeTruthy();
    expect(getByText('Hoàn tất hồ sơ')).toBeTruthy();
    expect(getByText('Ảnh đại diện')).toBeTruthy();
    expect(getByText('Ảnh hồ sơ game')).toBeTruthy();
    expect(getByText('Tường ảnh')).toBeTruthy();
    expect(getByText('Tạo hồ sơ')).toBeTruthy();
    expect(getByText('Quay lại')).toBeTruthy();
  });

  it('opens the avatar source picker', async () => {
    const { getByLabelText, getByText } = await renderScreen();

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

    await renderScreen();

    await waitFor(() => {
      const data = usePersistedOnboardingDraftStore.getState().envelope?.data;
      expect(data?.pendingMediaSelection).toBeUndefined();
      expect(data?.mediaQueue?.[0]).toEqual(
        expect.objectContaining({
          asset: expect.objectContaining({ uri: 'file:///avatar.jpg' }),
          position: 0,
          slot: 'avatar',
          status: 'selected',
        }),
      );
    });
  });

  it('completes the authoritative profile then publishes local completion', async () => {
    const { getByText } = await renderScreen();

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
    expect(mockSynchronizeAuthSession).toHaveBeenCalledTimes(1);
    expect(
      usePersistedOnboardingDraftStore.getState().envelope?.data
        .compatibilityWarnings,
    ).toEqual([
      expect.objectContaining({ code: 'lane_priority_not_persisted' }),
    ]);
  });

  it('keeps media_pending and does not publish active navigation when upload fails', async () => {
    const failedItem = mediaItem();
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
        const errorItem: OnboardingMediaQueueItem = {
          ...failedItem,
          failure: { code: 'upload_failed', message: 'R2 unavailable' },
          status: 'failed',
        };
        await onItemChange(errorItem);
        return { failed: [errorItem], items: [errorItem] };
      },
    );
    const { getByText } = await renderScreen();

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
    expect(mockSynchronizeAuthSession).not.toHaveBeenCalled();
  });

  it('replays authoritative completion when local media_pending is stale', async () => {
    const failedItem = mediaItem({
      failure: { code: 'association_failed', message: 'R2 unavailable' },
      localId: 'avatar:0:failed',
      status: 'failed',
      uploadedAssetId: 'asset-1',
    });
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
        const associated: OnboardingMediaQueueItem = {
          ...failedItem,
          failure: null,
          status: 'associated',
        };
        await onItemChange(associated);
        return { failed: [], items: [associated] };
      },
    );
    const { getByText } = await renderScreen();

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
    expect(mockSynchronizeAuthSession).toHaveBeenCalledTimes(1);
  });

  it('does not rerun core completion for an already active player', async () => {
    const failedItem = mediaItem({
      status: 'associated',
      uploadedAssetId: 'asset-1',
      uploadedObjectKey: 'personal_avatar/test/asset-1.jpg',
    });
    usePersistedOnboardingDraftStore.setState({
      envelope: onboardingEnvelope({
        data: {
          ...onboardingEnvelope().data,
          mediaQueue: [failedItem],
        },
        status: 'media_pending',
      }),
    });
    mockRunOnboardingMediaQueue.mockResolvedValueOnce({
      failed: [],
      items: [failedItem],
    });
    const { getByText } = await renderScreen(activeSession);

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
    expect(mockSynchronizeAuthSession).not.toHaveBeenCalled();
  });
});

function mediaItem(
  patch: Partial<OnboardingMediaQueueItem> = {},
): OnboardingMediaQueueItem {
  return {
    ...createOnboardingMediaQueueItem({
      asset: { mimeType: 'image/jpeg', uri: 'file:///avatar.jpg' },
      localId: 'avatar:0:selected',
      position: 0,
      slot: 'avatar',
    }),
    ...patch,
  };
}
