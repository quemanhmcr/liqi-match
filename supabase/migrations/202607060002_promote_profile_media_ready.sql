-- Profile media is public and needs to be immediately displayable after upload.
-- The app's media worker serves only ready + approved assets, so backfill any
-- already-finalized onboarding media that was left uploaded + pending.
update public.media_assets
set status = 'ready',
    moderation_status = 'approved',
    updated_at = now()
where purpose = any(array['personal_avatar', 'game_profile']::public.media_purpose[])
  and status = 'uploaded'
  and moderation_status = 'pending'
  and deleted_at is null;
