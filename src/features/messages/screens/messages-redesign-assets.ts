import type { ImageSourcePropType } from 'react-native';

// Metro requires static string literals for bundled images. Keep this registry
// beside the Messages presentation so visual ownership remains explicit.
export const messagesChatAssets = {
  chatEventBanner:
    require('../../../../assets/new_ui/liqi_messages_backgrounds/chat_event_banner_bg.png') as ImageSourcePropType,
  chatWallpaper:
    require('../../../../assets/new_ui/liqi_messages_backgrounds/chat_wallpaper_bg.png') as ImageSourcePropType,
  inboxLove:
    require('../../../../assets/new_ui/liqi_messages_backgrounds/messages_love_room_bg.png') as ImageSourcePropType,
  inboxPair:
    require('../../../../assets/new_ui/liqi_messages_backgrounds/messages_pair_room_bg.png') as ImageSourcePropType,
  inboxParty:
    require('../../../../assets/new_ui/liqi_messages_backgrounds/messages_party_room_bg.png') as ImageSourcePropType,
  inboxRank:
    require('../../../../assets/new_ui/liqi_messages_backgrounds/messages_rank_team_bg.png') as ImageSourcePropType,
} as const;
