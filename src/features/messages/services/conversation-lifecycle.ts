export type SetConversationMutedCommand = Readonly<{
  conversationId: string;
  muted: boolean;
}>;

export type SetConversationMutedReceipt = Readonly<{
  conversationId: string;
  muted: boolean;
}>;

export interface ConversationLifecyclePort {
  setMuted(
    command: SetConversationMutedCommand,
  ): Promise<SetConversationMutedReceipt>;
}
