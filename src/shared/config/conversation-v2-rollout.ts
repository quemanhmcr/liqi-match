import Constants from 'expo-constants';

const enabledValues = new Set(['1', 'true', 'yes']);
const disabledValues = new Set(['', '0', 'false', 'no']);

type ExpoExtra = {
  publicEnv?: { conversationV2Enabled?: boolean };
};

export function isConversationV2Enabled(
  rawValue = process.env.EXPO_PUBLIC_CONVERSATION_V2_ENABLED ??
    String(
      (Constants.expoConfig?.extra as ExpoExtra | undefined)?.publicEnv
        ?.conversationV2Enabled ?? false,
    ),
) {
  const normalized = rawValue.trim().toLowerCase();
  if (enabledValues.has(normalized)) return true;
  if (disabledValues.has(normalized)) return false;
  throw new Error(
    'EXPO_PUBLIC_CONVERSATION_V2_ENABLED must be true/false, 1/0, or yes/no.',
  );
}
