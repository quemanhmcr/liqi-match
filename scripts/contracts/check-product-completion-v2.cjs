const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = path.resolve(__dirname, '..', '..');
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
const failures = [];
const expectInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

const files = {
  routes: read('src/app-shell/navigation/routes.ts'),
  appConfig: read('app.config.ts'),
  packageJson: read('package.json'),
  socialRoute: read('src/app/(app)/social/index.tsx'),
  socialScreen: read('src/features/social/screens/SocialHubScreen.tsx'),
  socialQueries: read(
    'src/entities/social-relationship/social-relationship-queries.ts',
  ),
  socialRepository: read(
    'src/entities/social-relationship/supabase-social-relationship-repository.ts',
  ),
  messagesInbox: read('src/features/messages/screens/MessagesScreen.tsx'),
  engagementRoute: read('src/app/(app)/profile/settings/engagement/index.tsx'),
  engagementScreen: read(
    'src/features/trust-outcomes/screens/EngagementPreferencesScreen.tsx',
  ),
  reputationHooks: read('src/entities/trust-outcomes/trust-outcomes-hooks.ts'),
  reputationScreen: read(
    'src/features/trust-outcomes/screens/ReputationLedgerScreen.tsx',
  ),
  feedbackScreen: read(
    'src/features/trust-outcomes/screens/SessionFeedbackScreen.tsx',
  ),
  homeTrust: read('src/features/home/components/HomeTrustActivitySection.tsx'),
  gallerySummary: read('src/entities/player-profile/profile-media-summary.ts'),
  galleryScreen: read('src/features/profile/screens/ProfileGalleryScreen.tsx'),
  galleryService: read(
    'src/features/profile/services/profile-gallery-service.ts',
  ),
  onboardingMedia: read(
    'src/features/onboarding/services/onboarding-media-queue-service.ts',
  ),
  profileHighlights: read(
    'src/features/profile/components/ProfileHighlights.tsx',
  ),
  privacy: read(
    'src/features/profile/components/ProfilePrivacySettingsSection.tsx',
  ),
  chat: read('src/features/messages/screens/ChatConversationScreen.tsx'),
  chatComposer: read(
    'src/features/messages/screens/chat-conversation-composer.tsx',
  ),
  chatMediaViewer: read('src/features/messages/components/ChatMediaViewer.tsx'),
  appServices: read('src/app-shell/runtime/create-application-services.ts'),
  mediaFinalize: read('supabase/functions/media-finalize-upload/handler.ts'),
  mediaProcess: read(
    'cloudflare/media-worker/src/application/process-media.ts',
  ),
  mediaQueue: read(
    'cloudflare/media-worker/src/transport/queue/media-queue-consumer.ts',
  ),
  mediaProcessHandler: read(
    'cloudflare/media-worker/src/transport/http/internal-process-handler.ts',
  ),
  mediaRepository: read(
    'cloudflare/media-worker/src/infrastructure/supabase/supabase-rest-client.ts',
  ),
  setMigration: read(
    'supabase/migrations/202607160900_match_set_dashboard_identity_v2.sql',
  ),
  declineMigration: read(
    'supabase/migrations/202607160910_decline_session_invite_v2.sql',
  ),
  socialHubMigration: read(
    'supabase/migrations/202607160911_social_hub_relationships_v2.sql',
  ),
  setTest: read(
    'supabase/tests/database/match_set_dashboard_identity_v2.test.sql',
  ),
  declineTest: read(
    'supabase/tests/database/decline_session_invite_v2.test.sql',
  ),
  socialHubTest: read(
    'supabase/tests/database/social_hub_relationships_v2.test.sql',
  ),
  sessionConversationDispatchMigration: read(
    'supabase/migrations/202607170103_session_conversation_dispatch_runtime_v2.sql',
  ),
  sessionConversationDispatchTest: read(
    'supabase/tests/database/session_conversation_dispatch_runtime_v2.test.sql',
  ),
  sessionConversationDispatchOrderingMigration: read(
    'supabase/migrations/202607170104_session_conversation_dispatch_ordering_v2.sql',
  ),
};

expectInvariant(
  files.routes.includes("hub: '/social'") &&
    files.socialRoute.includes('SocialHubScreen'),
  'Social Hub must have an Expo Router destination.',
);
expectInvariant(
  files.socialScreen.includes('useSocialRelationshipsQuery') &&
    !files.socialScreen.includes('useFriendshipsQuery') &&
    files.socialScreen.includes('canAcceptFriendship') &&
    files.socialScreen.includes('canDeclineFriendship') &&
    files.socialScreen.includes('canRemoveFriendship') &&
    files.socialScreen.includes('usePlayerIdentities') &&
    files.socialQueries.includes('socialRelationshipsQueryKey') &&
    files.socialRepository.includes("'list_social_relationships_v2'"),
  'Social Hub must consume an inclusive identity-aware relationship read model.',
);
expectInvariant(
  files.socialHubMigration.includes('list_social_relationships_v2') &&
    files.socialHubMigration.includes("requests.state = 'pending'") &&
    files.socialHubMigration.includes(
      "relationships.friendship_state = 'accepted'",
    ) &&
    files.socialHubMigration.includes('are_players_blocked_v2') &&
    files.socialHubTest.includes(
      'Social Hub combines accepted friendships and pending requests',
    ) &&
    files.socialHubTest.includes(
      'recipient sees the same pending request as incoming',
    ),
  'Social Hub accepted/pending semantics must be protected by migration and pgTAP coverage.',
);
expectInvariant(
  files.messagesInbox.includes('FriendPlayerPickerModal') &&
    files.messagesInbox.includes('findDirectConversation') &&
    files.messagesInbox.includes('inboxQuery.refetch()') &&
    files.messagesInbox.includes('openConversation(conversation.id)') &&
    !files.messagesInbox.includes('onPress={lightImpact}') &&
    !files.messagesInbox.includes('Tuỳ chọn tin nhắn'),
  'Messages compose must open an existing provisioned friend conversation and expose no no-op header controls.',
);
expectInvariant(
  files.engagementRoute.includes('EngagementPreferencesScreen') &&
    files.engagementScreen.includes('useEngagementPreferences') &&
    files.engagementScreen.includes('useUpdateEngagementPreferences') &&
    files.engagementScreen.includes('maxReactivationNotificationsPerDay') &&
    files.engagementScreen.includes('preferences.version'),
  'Engagement preferences must use the authoritative versioned policy provider.',
);
expectInvariant(
  files.reputationHooks.includes('useReputationLedger') &&
    files.reputationScreen.includes('usePlayerTrustProjection') &&
    files.reputationScreen.includes('useReputationLedger') &&
    files.reputationScreen.includes('ReputationLedgerEntryV2'),
  'Reputation UI must consume privacy-aware projections and immutable ledger facts.',
);
expectInvariant(
  files.feedbackScreen.includes('usePlayerIdentities') &&
    !files.feedbackScreen.includes('Đồng đội {index + 1}'),
  'Session feedback must display resolved player identities instead of ordinal placeholders.',
);
expectInvariant(
  files.homeTrust.includes(
    'appRoutes.sessions.detail(createdSession.sessionId)',
  ) && !files.homeTrust.includes('Mở Messages'),
  'Repeat-play success must navigate to the exact created Session.',
);
expectInvariant(
  files.gallerySummary.includes(
    "PROFILE_WALL_MEDIA_IDS_KEY = 'wall_media_ids'",
  ) &&
    files.gallerySummary.includes('PROFILE_WALL_MEDIA_LIMIT = 4') &&
    files.gallerySummary.includes('updateProfileWallMediaSlot'),
  'Profile gallery must use one stable ordered media-summary contract.',
);
expectInvariant(
  files.galleryScreen.includes('pending') &&
    files.galleryScreen.includes('retryPending') &&
    files.galleryService.includes('associateProfileGalleryAsset') &&
    files.galleryService.includes('uploadProfileGalleryAsset'),
  'Post-onboarding gallery must preserve uploaded assets and retry association separately.',
);
expectInvariant(
  /return item\.status === 'associated'/.test(files.onboardingMedia) &&
    files.onboardingMedia.includes('associateProfileMedia') &&
    files.onboardingMedia.includes('updateProfileWallMediaSlot'),
  'Onboarding cover/wall media must complete only after authoritative association.',
);
expectInvariant(
  files.profileHighlights.includes('wallUrls') &&
    files.profileHighlights.includes('Quản lý tường ảnh'),
  'Profile highlights must render associated remote gallery assets and expose self-management.',
);
expectInvariant(
  files.privacy.includes('không tự tạo trạng thái online') &&
    files.privacy.includes('khi presence được phát'),
  'Presence copy must describe authorization without claiming a presence producer exists.',
);
expectInvariant(
  files.packageJson.includes('\"expo-video\": \"~56.1.4\"') &&
    files.appConfig.includes("'expo-video'") &&
    files.chatMediaViewer.includes('useVideoPlayer') &&
    files.chatMediaViewer.includes('<VideoView') &&
    files.chatMediaViewer.includes('nativeControls') &&
    !files.chatMediaViewer.includes('Video preview'),
  'Chat video attachments must use Expo Video playback instead of a placeholder.',
);
expectInvariant(
  !files.chat.includes('Sắp có') &&
    !files.chatComposer.includes('Sắp có') &&
    !files.chat.includes('đang được hoàn thiện') &&
    !files.chatComposer.includes('đang được hoàn thiện') &&
    /actionState\('image'\) === 'available'/.test(files.chatComposer) &&
    /actionState\('camera'\) === 'available'/.test(files.chatComposer),
  'Messages composer must fail closed and render only actions with production handlers.',
);
expectInvariant(
  !files.appServices.includes('MessagesServicesProvider value={null}') &&
    files.appServices.includes('createSupabaseConversationV2Adapter'),
  'Production composition must retain the Conversation V2 adapter and no null public provider.',
);
expectInvariant(
  files.mediaFinalize.includes('/internal/media/process') &&
    files.mediaFinalize.includes('media_processing_requested') &&
    files.mediaFinalize.includes('enqueueMediaProcessingJob'),
  'Media finalize must durably record and directly enqueue processing work.',
);
expectInvariant(
  files.mediaProcess.includes('validateMagicBytes') &&
    files.mediaProcess.includes('byte_size_mismatch') &&
    files.mediaProcess.includes('markReady') &&
    files.mediaProcess.includes('markRejected'),
  'Media processing must validate object integrity and persist terminal authority transitions.',
);
expectInvariant(
  files.mediaQueue.includes(
    "message.body.type === 'media_processing_requested'",
  ) &&
    files.mediaQueue.includes('recordMediaAnomaly') &&
    files.mediaProcessHandler.includes('authentication_required'),
  'Cloudflare Queue must process uploads and persist read-time media anomalies behind internal auth.',
);
expectInvariant(
  files.mediaRepository.includes("status: 'ready'") &&
    files.mediaRepository.includes("status: 'rejected'") &&
    files.mediaRepository.includes("moderation_status: 'approved'") &&
    files.mediaRepository.includes("moderation_status: 'rejected'"),
  'Media repository must implement idempotent ready/rejected state transitions.',
);
expectInvariant(
  files.setMigration.includes('get_match_set_dashboard_v2') &&
    files.setMigration.includes('list_visible_player_identities_v2') &&
    files.setTest.includes(
      'identity resolver excludes a private unrelated player',
    ),
  'Set dashboard and identity privacy authority must include behavioral pgTAP coverage.',
);
expectInvariant(
  files.sessionConversationDispatchMigration.includes(
    'dispatch_session_conversation_events_v2',
  ) &&
    files.sessionConversationDispatchMigration.includes(
      'process_pending_session_conversation_events_v2',
    ) &&
    files.sessionConversationDispatchMigration.includes(
      "'session-conversation-events-v2'",
    ) &&
    files.sessionConversationDispatchMigration.includes(
      'session_conversation_event_failures_v2',
    ) &&
    files.sessionConversationDispatchMigration.includes(
      'get_session_conversation_dispatch_health_v2',
    ) &&
    files.sessionConversationDispatchTest.includes(
      'dispatcher replay does not create a duplicate Conversation',
    ) &&
    files.sessionConversationDispatchTest.includes(
      'immediate retry cannot bypass backoff',
    ) &&
    files.sessionConversationDispatchOrderingMigration.includes(
      "events.payload ->> 'aggregateVersion'",
    ) &&
    files.sessionConversationDispatchOrderingMigration.includes('nulls last'),
  'Session Conversation must have cron dispatch, retry/backoff, health, and idempotent pgTAP coverage.',
);
expectInvariant(
  files.declineMigration.includes('decline_session_invite_v2') &&
    files.declineMigration.includes('session.invite_declined.v2') &&
    files.declineTest.includes('same idempotency key replays the receipt') &&
    files.declineTest.includes('membership version'),
  'Session invite decline must include version, event, idempotency and membership pgTAP coverage.',
);

(async () => {
  for (const [relative, sql] of [
    [
      'supabase/migrations/202607160900_match_set_dashboard_identity_v2.sql',
      files.setMigration,
    ],
    [
      'supabase/migrations/202607160910_decline_session_invite_v2.sql',
      files.declineMigration,
    ],
    [
      'supabase/migrations/202607160911_social_hub_relationships_v2.sql',
      files.socialHubMigration,
    ],
    [
      'supabase/tests/database/match_set_dashboard_identity_v2.test.sql',
      files.setTest,
    ],
    [
      'supabase/tests/database/decline_session_invite_v2.test.sql',
      files.declineTest,
    ],
    [
      'supabase/tests/database/social_hub_relationships_v2.test.sql',
      files.socialHubTest,
    ],
    [
      'supabase/migrations/202607170103_session_conversation_dispatch_runtime_v2.sql',
      files.sessionConversationDispatchMigration,
    ],
    [
      'supabase/tests/database/session_conversation_dispatch_runtime_v2.test.sql',
      files.sessionConversationDispatchTest,
    ],
    [
      'supabase/migrations/202607170104_session_conversation_dispatch_ordering_v2.sql',
      files.sessionConversationDispatchOrderingMigration,
    ],
  ]) {
    const parser = await PgQueryModule();
    const result = parser.parse(sql);
    expectInvariant(
      !result.error?.message,
      `${relative} PostgreSQL parse failed: ${result.error?.message}`,
    );
  }

  for (const [relative, sql] of [
    [
      'supabase/migrations/202607160900_match_set_dashboard_identity_v2.sql',
      files.setMigration,
    ],
    [
      'supabase/migrations/202607160910_decline_session_invite_v2.sql',
      files.declineMigration,
    ],
    [
      'supabase/migrations/202607160911_social_hub_relationships_v2.sql',
      files.socialHubMigration,
    ],
  ]) {
    for (const functionSql of sql.match(
      /create or replace function[\s\S]*?\$\$;/gi,
    ) ?? []) {
      if (!/language\s+plpgsql/i.test(functionSql)) continue;
      const parser = await PgQueryModule();
      const result = parser.parsePlpgsql(functionSql);
      expectInvariant(
        !result.error?.message,
        `${relative} PL/pgSQL parse failed: ${result.error?.message}`,
      );
    }
  }

  if (failures.length) {
    console.error('Product completion v2 check failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log(
    'Product completion v2 check passed: social, trust, repeat-play, gallery, presence, messaging, media pipeline and database coverage are wired.',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
