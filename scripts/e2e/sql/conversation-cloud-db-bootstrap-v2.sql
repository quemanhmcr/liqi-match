create extension if not exists pgtap with schema extensions;

do $$
begin
  if to_regclass('realtime.messages') is null
    or to_regprocedure('realtime.topic()') is null
    or to_regprocedure(
      'realtime.broadcast_changes(text,text,text,text,text,record,record,text)'
    ) is null
  then
    raise exception 'Realtime tenant schema is not ready for Conversation V2 cloud tests';
  end if;
end;
$$;
