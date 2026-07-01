create extension if not exists pgtap with schema extensions;

begin;

select plan(4);

select has_table('public', 'media_assets', 'media_assets exists');
select has_table('private', 'outbox_events', 'outbox_events exists');
select has_column('public', 'media_assets', 'object_key', 'media object_key exists');
select set_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'media_assets' order by policyname$$,
  $$values
    ('Conversation members can read ready conversation media metadata'),
    ('Users can read own media'),
    ('Users can read ready public media metadata')$$,
  'media_assets exposes only explicit read policies'
);

select * from finish();

rollback;
