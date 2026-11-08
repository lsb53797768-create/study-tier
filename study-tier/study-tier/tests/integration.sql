\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','alice@x','{"username":"alice","display_name":"앨리스","group_code":"2-3"}'),
 ('22222222-2222-2222-2222-222222222222','bob@x','{"username":"bob","display_name":"밥","group_code":"2-3"}'),
 ('33333333-3333-3333-3333-333333333333','carol@x','{"username":"carol","display_name":"캐롤"}');
-- 잘못된 아이디는 가입 거부
do $$ begin
  insert into auth.users(email,raw_user_meta_data) values ('x@x','{"username":"한글아이디"}');
  raise exception 'should have failed';
exception when others then if sqlerrm <> 'INVALID_USERNAME' then raise; end if; end $$;
select 'profiles created: ' || count(*) from profiles;

-- 익명 권한
set role anon;
select 'anon ping: ' || public.ping();
do $$ begin perform public.get_me(); raise exception 'anon get_me should fail';
exception when insufficient_privilege then null; end $$;
reset role;

-- 앨리스
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
do $$ begin perform * from public.profiles; raise exception 'direct read should fail';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public._rank_step('{}'::jsonb,1,1,1,false); raise exception 'internal fn should fail';
exception when insufficient_privilege then null; end $$;
select 'me tier before: ' || coalesce(public.get_me()->'profile'->>'tier','null');
select 'school a10: ' || (public.set_school(92, 2, 5, 3, true)->'profile'->>'a10');
select 'placement n: ' || (public.start_session('placement', 3)->>'n');
do $$ begin perform public.finish_session((select (public.get_me()->'open_session'->>'id')::uuid), repeat('O',15));
  raise exception 'should be too fast';
exception when others then if sqlerrm not like 'TOO_FAST:%' then raise; end if; end $$;
reset role;
update sessions set started_at = now() - interval '20 minutes' where status='open';
set role authenticated;
select 'placed: ' || (r->'after')::text || ' events ' || (r->'events')::text
  from (select public.finish_session((public.get_me()->'open_session'->>'id')::uuid, 'OOOOOOOOOOOOOXO') r) z;
-- 랭크 여러 판 (전부 정답)
do $$ declare s jsonb; r jsonb; i int;
begin
  for i in 1..12 loop
    s := public.start_session('ranked', 2);
    reset role;
    update sessions set started_at = now() - interval '30 minutes' where id = (s->>'id')::uuid;
    set role authenticated;
    r := public.finish_session((s->>'id')::uuid, repeat('O', (s->>'n')::int));
    raise notice 'game % n=% result=% lp% events=% after=%', i, s->>'n', r->>'result', r->>'lpDelta', r->'events', r->'after';
  end loop;
end $$;
-- 열린 세션이 있을 때 다른 종류 시작 금지
select 'ranked open: ' || (public.start_session('ranked', 2)->>'status');
select 'resume same: ' || (public.start_session('ranked', 2)->>'status');
-- 탈주
select 'abandon: ' || (r->>'result') || ' lp ' || (r->>'lpDelta') from (select public.abandon_session((public.get_me()->'open_session'->>'id')::uuid) r) z;
reset role;

-- 밥: 배치 (성적 비공개)
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select 'bob school: ' || (public.set_school(70, 4, 9, null, false)->'profile'->>'a10');
select public.start_session('placement', 2)->>'n';
reset role; update sessions set started_at = now() - interval '20 minutes' where status='open'; set role authenticated;
select 'bob placed: ' || (public.finish_session((public.get_me()->'open_session'->>'id')::uuid, 'OOOXOOXOOOXOOOO')->'after')::text;
reset role;

-- 대결: 앨리스 → 밥
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select 'duel created: ' || (public.create_duel('bob', 3)->>'status');
do $$ begin perform public.create_duel('alice', 3); raise exception 'self duel'; exception when others then if sqlerrm <> 'CANNOT_DUEL_SELF' then raise; end if; end $$;
select 'alice duel start n=' || (public.start_session('duel', 1, (public.my_duels()->0->>'id')::uuid)->>'n');
reset role; update sessions set started_at = now() - interval '9 minutes' where status='open'; set role authenticated;
select 'alice duel finish: ' || (public.finish_session((public.get_me()->'open_session'->>'id')::uuid, 'OOOOOOOOOOXO')->'duel'->>'status');
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select 'bob alerts: ' || (public.get_me()->>'duel_alerts');
do $$ begin perform public.start_session('duel', 1, (public.my_duels()->0->>'id')::uuid); raise exception 'must accept first';
exception when others then if sqlerrm <> 'DUEL_NOT_ACCEPTED' then raise; end if; end $$;
select 'bob accept: ' || (public.respond_duel((public.my_duels()->0->>'id')::uuid, true)->>'status');
select 'bob duel start n=' || (public.start_session('duel', 1, (public.my_duels()->0->>'id')::uuid)->>'n');
reset role; update sessions set started_at = now() - interval '10 minutes' where status='open'; set role authenticated;
select 'bob duel result: winner=' || (r->'duel'->>'winner') || ' mine=' || (r->'duel'->>'my_wrong') || ' theirs=' || (r->'duel'->>'their_wrong')
  from (select public.finish_session((public.get_me()->'open_session'->>'id')::uuid, 'OOOOXOOOOOXO') r) z;
-- 밥이 보는 앨리스 프로필 (앨리스는 성적 공개)
select 'alice school visible to bob: ' || coalesce(public.get_profile('alice')->'profile'->>'a10','hidden');
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select 'bob school visible to alice: ' || coalesce(public.get_profile('bob')->'profile'->>'a10','hidden') || ' eval has acad: ' || ((public.get_profile('bob')->'profile'->'eval') ? 'acad')::text;
select 'leaderboard: ' || (select string_agg(x->>'rank' || '.' || (x->>'username') || ' t' || (x->>'tier') || ' d' || (x->>'div') || ' ' || (x->>'lp') || 'LP grade ' || coalesce(x->>'grade','-'), ' | ') from jsonb_array_elements(public.leaderboard()) x);
select 'group 2-3 count: ' || jsonb_array_length(public.leaderboard('2-3'));
select 'alice duel record: ' || (public.get_me()->'profile'->>'duel_wins') || 'W ' || (public.get_me()->'profile'->>'duel_losses') || 'L';
select 'alice eval: ' || (public.get_me()->'profile'->'eval')::text;
-- 3시간 방치 → 자동 탈주
select public.start_session('ranked', 2)->>'n';
reset role; update sessions set started_at = now() - interval '4 hours' where status='open'; set role authenticated;
select 'after expire open_session: ' || coalesce(public.get_me()->>'open_session', 'none') || ' last: ' || (public.get_me()->'history'->0->>'status');
select 'history len: ' || jsonb_array_length(public.get_me()->'history');
reset role;
select 'ALL INTEGRATION CHECKS PASSED';
