import type { ImageSourcePropType } from 'react-native';

const playStyleTacticsNeutral =
  require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_tactics_neutral_mobile.jpg') as ImageSourcePropType;

// Metro requires static string literals for bundled images. Keep this registry
// beside the Profile presentation so visual ownership remains explicit.
export const profileScreenAssets = {
  memoryStarter:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_memory_new_warrior_mobile.jpg') as ImageSourcePropType,
  playStyleCoordinationAnalytical:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_coordination_analytical_mobile.jpg') as ImageSourcePropType,
  playStyleCoordinationAutonomous:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_coordination_autonomous_mobile.jpg') as ImageSourcePropType,
  playStyleCoordinationNeutral:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_coordination_neutral_mobile.jpg') as ImageSourcePropType,
  playStyleCoordinationShotCaller:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_coordination_shotcaller_mobile.jpg') as ImageSourcePropType,
  playStyleCoordinationVoiceNeeded:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_coordination_voice_needed_mobile.jpg') as ImageSourcePropType,
  playStyleGoalCasual:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_goal_casual_mobile.jpg') as ImageSourcePropType,
  playStyleGoalDuo:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_goal_duo_mobile.jpg') as ImageSourcePropType,
  playStyleGoalNeutral:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_goal_neutral_mobile.jpg') as ImageSourcePropType,
  playStyleGoalPractice:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_goal_practice_mobile.jpg') as ImageSourcePropType,
  playStyleGoalRankClimb:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_goal_rank_climb_mobile.jpg') as ImageSourcePropType,
  playStyleTacticsNeutral,
  // The supplied objective-control PNG is missing its final 380 scanlines.
  // Fail closed to the neutral tactics artwork until that single asset is replaced.
  playStyleTacticsObjectiveControl: playStyleTacticsNeutral,
  playStyleTacticsPlaymaker:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_tactics_playmaker_mobile.jpg') as ImageSourcePropType,
  playStyleTacticsProtector:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_tactics_protector_mobile.jpg') as ImageSourcePropType,
  playStyleTacticsScaling:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_tactics_scaling_mobile.jpg') as ImageSourcePropType,
  // Kept during the content migration; no new Profile surface consumes these.
  playStyleCreative:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_creative_mobile.jpg') as ImageSourcePropType,
  playStyleFinisher:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_finisher_mobile.jpg') as ImageSourcePropType,
  playStyleRhythm:
    require('../../../../assets/new_ui/liqi_profile_backgrounds/profile_playstyle_rhythmkeeper_mobile.jpg') as ImageSourcePropType,
} as const;
