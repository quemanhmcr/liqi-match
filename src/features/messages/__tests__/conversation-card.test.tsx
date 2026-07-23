import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { appColors } from '@/shared/ui';

import { ConversationCard } from '../components/ConversationCard';
import type { MessageInboxConversationViewModel } from '../model/message-surface-presenters';

const densityCases: [string, boolean, number, number][] = [
  ['regular', false, 96, 52],
  ['compact', true, 90, 48],
];

function conversation(
  overrides: Partial<MessageInboxConversationViewModel> = {},
): MessageInboxConversationViewModel {
  return {
    attentionState: 'normal',
    canMessage: true,
    id: 'match-conversation',
    isDraft: false,
    isGroup: false,
    isMuted: false,
    isOnline: false,
    isPinned: false,
    kind: 'direct',
    lastMessage: 'Chào bạn',
    latestDirection: 'incoming',
    name: 'An Nhiên',
    participantAvatars: [],
    participantCount: 2,
    presenceLabel: 'Đã ghép đôi',
    relationship: 'match',
    relationshipLabel: 'Đã ghép đôi',
    time: 'T2',
    tone: 'cyan',
    ...overrides,
  };
}

describe('ConversationCard semantics', () => {
  it('does not present ordinary match rows as favorites or offline presence', async () => {
    const screen = await render(
      <ConversationCard
        compact={false}
        conversation={conversation()}
        onPress={jest.fn()}
      />,
    );

    expect(
      screen.queryByTestId(
        'messages-conversation-relationship-icon-match-conversation',
      ),
    ).toBeNull();
    expect(
      screen.queryByTestId(
        'messages-conversation-online-indicator-match-conversation',
      ),
    ).toBeNull();
    expect(
      screen.queryByTestId(
        'messages-conversation-group-indicator-match-conversation',
      ),
    ).toBeNull();
    expect(screen.getByText('Đã ghép đôi')).toBeTruthy();
  });

  it('reserves the presence dot for authoritative online state', async () => {
    const screen = await render(
      <ConversationCard
        compact={false}
        conversation={conversation({
          id: 'online-friend',
          isOnline: true,
          presenceLabel: 'Đang online',
          relationship: 'friend',
          relationshipLabel: 'Bạn bè',
        })}
        onPress={jest.fn()}
      />,
    );

    expect(
      screen.queryByTestId(
        'messages-conversation-relationship-icon-online-friend',
      ),
    ).toBeNull();
    const presence = screen.getByTestId(
      'messages-conversation-online-indicator-online-friend',
    );
    expect(StyleSheet.flatten(presence.props.style)).toMatchObject({
      color: appColors.status.online,
      fontSize: 8,
    });
    expect(screen.getByText('Đang online')).toBeTruthy();
  });

  it('keeps special relationship semantics explicit', async () => {
    const screen = await render(
      <ConversationCard
        compact={false}
        conversation={conversation({
          id: 'soulmate',
          relationship: 'soulmate',
          relationshipLabel: 'Tri kỉ',
        })}
        onPress={jest.fn()}
      />,
    );

    const relationship = screen.getByLabelText('Tri kỉ');
    expect(StyleSheet.flatten(relationship.props.style)).toMatchObject({
      color: appColors.accent.pink,
      fontSize: 18,
    });
  });

  it('uses group membership, not relationship decoration, for group metadata', async () => {
    const screen = await render(
      <ConversationCard
        compact={false}
        conversation={conversation({
          id: 'friend-group',
          isGroup: true,
          kind: 'group',
          participantCount: 3,
          presenceLabel: '2 người online',
          relationship: 'friend',
          relationshipLabel: 'Bạn bè',
        })}
        onPress={jest.fn()}
      />,
    );

    expect(
      screen.queryByTestId(
        'messages-conversation-relationship-icon-friend-group',
      ),
    ).toBeNull();
    expect(
      StyleSheet.flatten(
        screen.getByTestId('messages-conversation-group-indicator-friend-group')
          .props.style,
      ),
    ).toMatchObject({
      color: appColors.accent.purple,
      fontSize: 14,
    });
    expect(screen.getByText('3 thành viên')).toBeTruthy();
  });

  it('renders only the primary accessory chosen by attention authority', async () => {
    const screen = await render(
      <ConversationCard
        compact={false}
        conversation={conversation({
          attentionState: 'failed',
          id: 'failed-with-draft-and-unread',
          isDraft: false,
          latestDeliveryStatus: 'failed',
          latestDirection: 'outgoing',
          unreadCount: 3,
        })}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Tin nhắn gửi thất bại')).toBeTruthy();
    expect(screen.queryByLabelText('Có bản nháp')).toBeNull();
    expect(screen.queryByLabelText('3 tin nhắn chưa đọc')).toBeNull();
    expect(
      StyleSheet.flatten(screen.getByText('An Nhiên').props.style),
    ).toMatchObject({
      color: appColors.text.secondary,
    });
  });

  it.each(densityCases)(
    'uses scan-first %s row geometry without shrinking content semantics',
    async (_layout, compact, minHeight, avatarSize) => {
      const screen = await render(
        <ConversationCard
          compact={compact}
          conversation={conversation({ id: `density-${_layout}` })}
          onPress={jest.fn()}
        />,
      );

      expect(
        StyleSheet.flatten(
          screen.getByTestId(
            `messages-conversation-card-density-${_layout}-content`,
          ).props.style,
        ),
      ).toMatchObject({
        minHeight,
        paddingVertical: 8,
      });
      expect(
        StyleSheet.flatten(
          screen.getByTestId(`messages-conversation-avatar-density-${_layout}`)
            .props.style,
        ),
      ).toMatchObject({
        height: avatarSize,
        width: avatarSize,
      });
    },
  );
});
