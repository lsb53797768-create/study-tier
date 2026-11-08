-- =====================================================================
--  공부 티어 (Study Tier) — Supabase 서버 스키마
--  사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를
--          붙여넣고 [Run]. 여러 번 실행해도 안전합니다(데이터는 유지).
--
--  보안 구조: 모든 테이블은 직접 읽기/쓰기 금지(RLS + 권한 회수).
--  앱은 아래 RPC 함수로만 접근하고, LP·티어 계산은 전부 서버에서 합니다.
--  → 브라우저 개발자도구로 점수를 조작할 수 없습니다.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique,
  display_name  text not null,
  group_code    text,
  tier          smallint,              -- null = 배치 전, 0 아이언 … 9 챌린저
  div           smallint,              -- 1~4 (마스터 이상은 0)
  lp            int not null default 0,
  mmr           int not null default 0, -- 숨은 실력 점수
  series        jsonb,                 -- 승급전/강등전 진행 상태
  shield        smallint not null default 0,
  streak        int not null default 0,
  wins          int not null default 0,
  losses        int not null default 0,
  duel_wins     int not null default 0,
  duel_losses   int not null default 0,
  peak_pos      int not null default -1,
  school        jsonb,                 -- 학교 성적 (본인만 열람, 공개 선택 가능)
  a10           int,                   -- 학업 지수 × 10
  show_school   boolean not null default false,
  eval          jsonb,                 -- 정성평가 캐시
  created_at    timestamptz not null default now(),
  last_played   timestamptz
);

create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('placement','ranked','duel')),
  duel_id     uuid,
  n           smallint not null,
  level       smallint not null check (level between 1 and 4),
  book        text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'open' check (status in ('open','done','forfeit')),
  wrong       smallint,
  marks       text,
  result      text,
  win         boolean,
  lp_delta    int,
  tier_after  smallint,
  div_after   smallint,
  lp_after    int,
  mmr_after   int,
  events      jsonb
);
create index if not exists sessions_user_idx on public.sessions(user_id, finished_at desc);
create unique index if not exists sessions_one_open on public.sessions(user_id) where status = 'open';

create table if not exists public.duels (
  id          uuid primary key default gen_random_uuid(),
  challenger  uuid not null references public.profiles(id) on delete cascade,
  opponent    uuid not null references public.profiles(id) on delete cascade,
  level       smallint not null,
  n           smallint not null,
  status      text not null default 'pending' check (status in ('pending','active','done','declined','expired')),
  c_session   uuid, o_session uuid,
  c_wrong     smallint, o_wrong smallint,
  c_secs      int, o_secs int,
  winner      uuid,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists duels_c_idx on public.duels(challenger, created_at desc);
create index if not exists duels_o_idx on public.duels(opponent, created_at desc);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.duels    enable row level security;

-- ---------------------------------------------------------------------
-- 2. 순수 계산 함수 (js/rules.js 와 동일한 규칙)
-- ---------------------------------------------------------------------
create or replace function public._fdiv(a bigint, b bigint) returns bigint
language sql immutable as $$ select floor(a::numeric / b)::bigint $$;

create or replace function public._clamp(v bigint, lo bigint, hi bigint) returns bigint
language sql immutable as $$ select greatest(lo, least(hi, v)) $$;

create or replace function public._floor_lp(t int) returns int
language sql immutable as $$ select case when t = 8 then 300 when t = 9 then 600 else 0 end $$;

create or replace function public._ceil_lp(t int) returns int
language sql immutable as $$ select case when t < 7 then 100 when t = 7 then 300 when t = 8 then 600 else 1000000000 end $$;

create or replace function public._ladder_pos(t int, d int, lp int) returns int
language sql immutable as $$
  select case when t is null then -1 when t < 7 then t * 400 + (4 - d) * 100 + lp else 2800 + lp end $$;

create or replace function public._level_mult(l int) returns int
language sql immutable as $$ select (array[85,100,110,125])[l] $$;

create or replace function public._level_win(l int) returns int
language sql immutable as $$ select (array[20,30,35,40])[l] $$;

create or replace function public._classify(wrong int, n int, lvl int) returns text
language plpgsql immutable as $$
declare w int := public._level_win(lvl); x int := wrong * 100;
begin
  if wrong = 0 then return 'perfect'; end if;
  if x <= (w - 10) * n then return 'victory'; end if;
  if x <= w * n then return 'close_win'; end if;
  if x <= (w + 15) * n then return 'close_loss'; end if;
  return 'defeat';
end $$;

create or replace function public._academic10(school jsonb) returns int
language plpgsql immutable as $$
declare
  g9 numeric[] := array[98, 92.5, 83, 68.5, 50, 31.5, 17, 7.5, 2];
  g5 numeric[] := array[95, 78, 50, 22, 5];
  s numeric := 0; w int := 0;
begin
  if school is null then return null; end if;
  if (school->>'score') is not null then s := s + 3 * (school->>'score')::numeric; w := w + 3; end if;
  if (school->>'grade') is not null then
    s := s + 4 * case when (school->>'sys')::int = 5 then g5[(school->>'grade')::int] else g9[(school->>'grade')::int] end;
    w := w + 4;
  end if;
  if (school->>'mock') is not null then s := s + 3 * g9[(school->>'mock')::int]; w := w + 3; end if;
  if w = 0 then return null; end if;
  return floor(s * 10 / w + 0.5)::int;
end $$;

create or replace function public._placement(n int, wrong int, lvl int, a10 int) returns jsonb
language plpgsql immutable as $$
declare base int; pos int;
begin
  base := public._fdiv(1400 * (n - wrong), n) + (lvl - 1) * 200;
  pos := case when a10 is null then base else public._fdiv(7 * base + 3 * (a10 * 2), 10) end;
  pos := public._clamp(pos, 0, 1699);
  return jsonb_build_object('tier', pos / 400, 'div', 4 - (pos % 400) / 100, 'lp', pos % 100, 'mmr', pos);
end $$;

-- 랭크 한 판 계산 (상태 jsonb → 결과 jsonb). 승급전/강등전/보호/연승 포함
create or replace function public._rank_step(st jsonb, n int, wrong int, lvl int, forfeit boolean default false)
returns jsonb language plpgsql immutable as $$
declare
  t int := (st->>'tier')::int;  d int := (st->>'div')::int;  lp int := (st->>'lp')::int;
  mmr int := (st->>'mmr')::int; a10 int := (st->>'a10')::int;
  series jsonb := st->'series';
  shield int := coalesce((st->>'shield')::int, 0);
  streak int := coalesce((st->>'streak')::int, 0);
  wins int := coalesce((st->>'wins')::int, 0);
  losses int := coalesce((st->>'losses')::int, 0);
  t0 int := t; d0 int := d;
  res text; win boolean; big_l int; w int; p int; m10 bigint; adj int; mult int; delta int; base int;
  events text[] := '{}'; lp_before int; promoted boolean := false; fl int; ce int;
  s_type text; s_need int; s_games int; s_wins int; s_losses int; division boolean;
begin
  if series is not null and jsonb_typeof(series) = 'null' then series := null; end if;
  res := case when forfeit then 'forfeit' else public._classify(wrong, n, lvl) end;
  win := res in ('perfect', 'victory', 'close_win');
  big_l := public._ladder_pos(t, d, lp);
  w := public._level_win(lvl);

  p := big_l + public._fdiv(12 * (w * n - 100 * wrong), n) + (lvl - 2) * 150;
  mmr := public._clamp(mmr + public._fdiv(3 * (p - mmr), 10), 0, 4000);
  m10 := case when a10 is null then 10 * mmr else 8 * mmr + 6 * a10 end;
  adj := public._clamp(public._fdiv(m10 - 10 * big_l + 250, 500), -8, 8);

  if win then streak := case when streak > 0 then streak + 1 else 1 end; wins := wins + 1;
  else streak := case when streak < 0 then streak - 1 else -1 end; losses := losses + 1; end if;

  mult := public._level_mult(lvl);
  base := case res when 'perfect' then 28 when 'victory' then 22 when 'close_win' then 16
                   when 'close_loss' then -14 else -20 end;
  if win then
    delta := greatest(public._fdiv(base * mult + 50, 100) + adj + case when streak >= 3 then 3 else 0 end, 8);
  else
    delta := least(public._fdiv(base * (case when res = 'forfeit' then 125 else 200 - mult end) + 50, 100) + adj, -6);
  end if;

  lp_before := lp; fl := public._floor_lp(t); ce := public._ceil_lp(t);

  if series is not null then
    s_type := series->>'type'; s_need := (series->>'need')::int; s_games := (series->>'games')::int;
    s_wins := (series->>'wins')::int + case when win then 1 else 0 end;
    s_losses := (series->>'losses')::int + case when win then 0 else 1 end;
    series := series || jsonb_build_object('wins', s_wins, 'losses', s_losses);
    if s_type = 'promo' then
      if s_wins >= s_need then
        if t < 7 then
          if d > 1 then d := d - 1; lp := 0;
          else t := t + 1; d := case when t < 7 then 4 else 0 end; lp := 0; end if;
        else
          t := t + 1; lp := public._floor_lp(t);
        end if;
        series := null; shield := 3; promoted := true; events := array_append(events, 'promoted');
      elsif s_losses >= s_games - s_need + 1 then
        series := null; lp := ce - 30; events := array_append(events, 'promo_failed');
      else
        events := array_append(events, 'promo_progress');
      end if;
    else
      if s_wins >= s_need then
        series := null; lp := fl + 25; events := array_append(events, 'demote_survived');
      elsif s_losses >= s_games - s_need + 1 then
        series := null;
        if t < 7 then
          if d < 4 then d := d + 1; else t := t - 1; d := 1; end if; lp := 75;
        elsif t = 7 then t := 6; d := 1; lp := 75;
        else t := t - 1; lp := public._ceil_lp(t) - 30; end if;
        events := array_append(events, 'demoted');
      else
        events := array_append(events, 'demote_progress');
      end if;
    end if;
  elsif win then
    lp := lp + delta;
    if lp >= ce then
      lp := ce; division := t < 7 and d > 1;
      series := jsonb_build_object('type', 'promo', 'scope', case when division then 'division' else 'tier' end,
        'need', case when division then 2 else 3 end, 'games', case when division then 3 else 5 end,
        'wins', 0, 'losses', 0);
      events := array_append(events, 'promo_start');
    end if;
  else
    if lp <= fl and not (t = 0 and d = 4) and shield = 0 then
      series := jsonb_build_object('type', 'demote', 'scope', 'demote', 'need', 2, 'games', 3, 'wins', 0, 'losses', 0);
      events := array_append(events, 'demote_start');
    else
      if lp <= fl and shield > 0 then events := array_append(events, 'shield_used'); end if;
      lp := greatest(fl, lp + delta);
    end if;
  end if;
  if not promoted and shield > 0 then shield := shield - 1; end if;

  return jsonb_build_object(
    'state', jsonb_build_object('tier', t, 'div', d, 'lp', lp, 'mmr', mmr, 'series', series, 'shield', shield,
                                'streak', streak, 'wins', wins, 'losses', losses, 'a10', a10),
    'result', res, 'win', win,
    'lpDelta', case when t = t0 and d = d0 then lp - lp_before else delta end,
    'adjust', adj, 'events', to_jsonb(events));
end $$;

-- ---------------------------------------------------------------------
-- 3. 내부 도우미
-- ---------------------------------------------------------------------
create or replace function public._uid() returns uuid
language plpgsql stable as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return u;
end $$;

create or replace function public._grade_of(t int) returns text
language sql immutable as $$
  select case when t >= 90 then 'S+' when t >= 80 then 'S' when t >= 70 then 'A'
              when t >= 60 then 'B' when t >= 45 then 'C' else 'D' end $$;

-- 정성평가: 정확도·도전·꾸준함·성장·학업을 종합
create or replace function public._refresh_eval(uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cnt int; acc numeric; chal numeric; days int; oldest int; pm int; pa int;
  v_acc int; v_chal int; v_cons int; v_grow int; v_acad int; v_total int; ev jsonb;
begin
  select mmr, a10 into pm, pa from profiles where id = uid;
  select count(*), avg((x.n - x.wrong)::numeric / x.n), avg((x.level - 1)::numeric / 3)
    into cnt, acc, chal
    from (select n, wrong, level from sessions
           where user_id = uid and kind in ('ranked','placement') and status <> 'open'
           order by finished_at desc limit 10) x;
  if cnt = 0 then update profiles set eval = null where id = uid; return null; end if;

  select count(distinct (finished_at at time zone 'Asia/Seoul')::date) into days
    from sessions where user_id = uid and kind in ('ranked','placement') and status <> 'open'
     and finished_at > now() - interval '14 days';
  select x.mmr_after into oldest from (
      select mmr_after, finished_at from sessions
       where user_id = uid and kind in ('ranked','placement') and status <> 'open'
       order by finished_at desc limit 10) x
    order by x.finished_at asc limit 1;

  v_acc := round(acc * 100); v_chal := round(chal * 100);
  v_cons := least(100, days * 10);
  v_grow := case when cnt < 2 then 50 else public._clamp(round(50 + (pm - coalesce(oldest, pm)) / 6.0)::int, 0, 100) end;
  v_acad := case when pa is null then null else round(pa / 10.0) end;
  v_total := case when v_acad is null
    then round((v_acc * 30 + v_chal * 20 + v_cons * 15 + v_grow * 10) / 75.0)
    else round((v_acc * 30 + v_chal * 20 + v_cons * 15 + v_grow * 10 + v_acad * 25) / 100.0) end;
  ev := jsonb_build_object('acc', v_acc, 'chal', v_chal, 'cons', v_cons, 'grow', v_grow,
                           'acad', v_acad, 'total', v_total, 'grade', public._grade_of(v_total));
  update profiles set eval = ev where id = uid;
  return ev;
end $$;

create or replace function public._public_profile(p public.profiles, viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'username', p.username, 'display_name', p.display_name, 'group_code', p.group_code,
    'tier', p.tier, 'div', p.div, 'lp', p.lp, 'series', p.series, 'shield', p.shield,
    'streak', p.streak, 'wins', p.wins, 'losses', p.losses,
    'duel_wins', p.duel_wins, 'duel_losses', p.duel_losses, 'peak_pos', p.peak_pos,
    'eval', case when p.show_school or p.id = viewer then p.eval else p.eval - 'acad' end,
    'school', case when p.show_school or p.id = viewer then p.school else null end,
    'a10', case when p.show_school or p.id = viewer then p.a10 else null end,
    'show_school', p.show_school,
    'last_played', p.last_played, 'created_at', p.created_at, 'is_me', p.id = viewer)
$$;

create or replace function public._session_json(s public.sessions) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', s.id, 'kind', s.kind, 'duel_id', s.duel_id, 'n', s.n, 'level', s.level, 'book', s.book,
    'started_at', s.started_at, 'server_now', now(), 'min_seconds', s.n * 30,
    'max_wrong_to_win', (public._level_win(s.level) * s.n) / 100, 'status', s.status)
$$;

create or replace function public._history(uid uuid, lim int) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(h order by h.finished_at desc), '[]'::jsonb) from (
    select id, kind, n, wrong, level, book, result, win, lp_delta, tier_after, div_after, lp_after,
           events, finished_at, marks, status
      from public.sessions where user_id = uid and status <> 'open'
     order by finished_at desc limit lim) h
$$;

-- 세션 마무리 (정상 제출 / 탈주 공통)
create or replace function public._finish(s public.sessions, p_wrong int, p_marks text, p_book text, p_forfeit boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pr profiles; step jsonb; st jsonb; pl jsonb; res jsonb; secs int; dl duels; ev jsonb;
  before jsonb; after jsonb; cls text; new_pos int;
begin
  select * into pr from profiles where id = s.user_id for update;
  secs := greatest(0, extract(epoch from now() - s.started_at)::int);
  before := jsonb_build_object('tier', pr.tier, 'div', pr.div, 'lp', pr.lp, 'series', pr.series, 'shield', pr.shield);

  if s.kind = 'placement' then
    pl := public._placement(s.n, p_wrong, s.level, pr.a10);
    cls := case when p_forfeit then 'forfeit' else public._classify(p_wrong, s.n, s.level) end;
    update profiles set tier = (pl->>'tier')::int, div = (pl->>'div')::int, lp = (pl->>'lp')::int,
           mmr = (pl->>'mmr')::int, series = null, shield = 0, streak = 0, last_played = now(),
           peak_pos = greatest(peak_pos, public._ladder_pos((pl->>'tier')::int, (pl->>'div')::int, (pl->>'lp')::int))
     where id = pr.id;
    update sessions set status = case when p_forfeit then 'forfeit' else 'done' end, finished_at = now(),
           wrong = p_wrong, marks = p_marks, book = p_book, result = cls, win = cls in ('perfect','victory','close_win'),
           lp_delta = 0, tier_after = (pl->>'tier')::int, div_after = (pl->>'div')::int, lp_after = (pl->>'lp')::int,
           mmr_after = (pl->>'mmr')::int, events = '["placed"]'::jsonb
     where id = s.id;
    ev := public._refresh_eval(pr.id);
    after := jsonb_build_object('tier', (pl->>'tier')::int, 'div', (pl->>'div')::int, 'lp', (pl->>'lp')::int, 'series', null, 'shield', 0);
    return jsonb_build_object('kind', 'placement', 'result', cls, 'win', cls in ('perfect','victory','close_win'),
      'n', s.n, 'wrong', p_wrong, 'level', s.level, 'secs', secs, 'lpDelta', 0, 'adjust', 0,
      'events', '["placed"]'::jsonb, 'before', before, 'after', after, 'eval', ev, 'streak', 0);

  elsif s.kind = 'ranked' then
    st := jsonb_build_object('tier', pr.tier, 'div', pr.div, 'lp', pr.lp, 'mmr', pr.mmr, 'series', pr.series,
      'shield', pr.shield, 'streak', pr.streak, 'wins', pr.wins, 'losses', pr.losses, 'a10', pr.a10);
    step := public._rank_step(st, s.n, p_wrong, s.level, p_forfeit);
    st := step->'state';
    new_pos := public._ladder_pos((st->>'tier')::int, (st->>'div')::int, (st->>'lp')::int);
    update profiles set tier = (st->>'tier')::int, div = (st->>'div')::int, lp = (st->>'lp')::int,
           mmr = (st->>'mmr')::int, series = case when jsonb_typeof(st->'series') = 'object' then st->'series' else null end,
           shield = (st->>'shield')::int, streak = (st->>'streak')::int,
           wins = (st->>'wins')::int, losses = (st->>'losses')::int, last_played = now(),
           peak_pos = greatest(peak_pos, new_pos)
     where id = pr.id;
    update sessions set status = case when p_forfeit then 'forfeit' else 'done' end, finished_at = now(),
           wrong = p_wrong, marks = p_marks, book = p_book, result = step->>'result', win = (step->>'win')::boolean,
           lp_delta = (step->>'lpDelta')::int, tier_after = (st->>'tier')::int, div_after = (st->>'div')::int,
           lp_after = (st->>'lp')::int, mmr_after = (st->>'mmr')::int, events = step->'events'
     where id = s.id;
    ev := public._refresh_eval(pr.id);
    after := jsonb_build_object('tier', (st->>'tier')::int, 'div', (st->>'div')::int, 'lp', (st->>'lp')::int,
                                'series', st->'series', 'shield', (st->>'shield')::int);
    return jsonb_build_object('kind', 'ranked', 'result', step->>'result', 'win', (step->>'win')::boolean,
      'n', s.n, 'wrong', p_wrong, 'level', s.level, 'secs', secs, 'lpDelta', (step->>'lpDelta')::int,
      'adjust', (step->>'adjust')::int, 'events', step->'events', 'before', before, 'after', after,
      'eval', ev, 'streak', (st->>'streak')::int);

  else -- duel
    cls := case when p_forfeit then 'forfeit' else public._classify(p_wrong, s.n, s.level) end;
    update sessions set status = case when p_forfeit then 'forfeit' else 'done' end, finished_at = now(),
           wrong = p_wrong, marks = p_marks, book = p_book, result = cls, win = null, lp_delta = 0
     where id = s.id;
    select * into dl from duels where id = s.duel_id for update;
    if dl.challenger = s.user_id then
      update duels set c_wrong = p_wrong, c_secs = case when p_forfeit then 999999 else secs end where id = dl.id;
    else
      update duels set o_wrong = p_wrong, o_secs = case when p_forfeit then 999999 else secs end where id = dl.id;
    end if;
    select * into dl from duels where id = dl.id;
    if dl.c_wrong is not null and dl.o_wrong is not null then
      update duels set status = 'done', finished_at = now(),
        winner = case when dl.c_wrong < dl.o_wrong then dl.challenger
                      when dl.o_wrong < dl.c_wrong then dl.opponent
                      when dl.c_secs < dl.o_secs then dl.challenger
                      when dl.o_secs < dl.c_secs then dl.opponent
                      else null end
       where id = dl.id returning * into dl;
      if dl.winner is not null then
        update profiles set duel_wins = duel_wins + 1 where id = dl.winner;
        update profiles set duel_losses = duel_losses + 1
         where id = case when dl.winner = dl.challenger then dl.opponent else dl.challenger end;
      end if;
    end if;
    return jsonb_build_object('kind', 'duel', 'result', cls, 'n', s.n, 'wrong', p_wrong, 'level', s.level,
      'secs', secs, 'before', before, 'after', before, 'events', '[]'::jsonb, 'lpDelta', 0,
      'duel', public._duel_json(dl, s.user_id));
  end if;
end $$;

-- 3시간 넘게 제출하지 않은 세션은 탈주(패배) 처리
create or replace function public._expire_sessions(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  for s in select * from sessions where user_id = uid and status = 'open'
            and started_at < now() - interval '3 hours' for update loop
    perform public._finish(s, s.n, repeat('X', s.n), s.book, true);
  end loop;
end $$;

create or replace function public._duel_json(d public.duels, viewer uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me_c boolean := d.challenger = viewer; other profiles; done boolean := d.status = 'done';
begin
  select * into other from profiles where id = case when me_c then d.opponent else d.challenger end;
  return jsonb_build_object(
    'id', d.id, 'level', d.level, 'n', d.n, 'status', d.status, 'created_at', d.created_at,
    'finished_at', d.finished_at, 'role', case when me_c then 'challenger' else 'opponent' end,
    'other', jsonb_build_object('username', other.username, 'display_name', other.display_name,
                                'tier', other.tier, 'div', other.div, 'lp', other.lp),
    'my_played', case when me_c then d.c_wrong is not null else d.o_wrong is not null end,
    'their_played', case when me_c then d.o_wrong is not null else d.c_wrong is not null end,
    'my_session', case when me_c then d.c_session else d.o_session end,
    'my_wrong', case when me_c then d.c_wrong else d.o_wrong end,
    'my_secs', case when me_c then d.c_secs else d.o_secs end,
    'their_wrong', case when done then (case when me_c then d.o_wrong else d.c_wrong end) end,
    'their_secs', case when done then (case when me_c then d.o_secs else d.c_secs end) end,
    'winner', case when not done then null when d.winner is null then 'draw'
                   when d.winner = viewer then 'me' else 'them' end);
end $$;

-- ---------------------------------------------------------------------
-- 4. 앱이 호출하는 RPC 함수
-- ---------------------------------------------------------------------
create or replace function public.ping() returns text language sql stable as $$ select 'pong' $$;

-- 가입 전 아이디 중복 확인 (존재 여부만 알려 줌)
create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(p_username, '')) ~ '^[a-z0-9_]{3,16}$'
     and not exists (select 1 from profiles where username = lower(p_username))
$$;

create or replace function public.get_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._uid(); pr profiles; s sessions; pending int;
begin
  perform public._expire_sessions(uid);
  select * into pr from profiles where id = uid;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select * into s from sessions where user_id = uid and status = 'open';
  select count(*) into pending from duels
   where (opponent = uid and status = 'pending' and created_at > now() - interval '3 days')
      or (status = 'active' and created_at > now() - interval '3 days'
          and ((challenger = uid and c_wrong is null) or (opponent = uid and o_wrong is null)));
  return jsonb_build_object(
    'profile', public._public_profile(pr, uid),
    'open_session', case when s.id is null then null else public._session_json(s) end,
    'history', public._history(uid, 15),
    'duel_alerts', pending,
    'rank', (select count(*) + 1 from profiles q where q.tier is not null
              and public._ladder_pos(q.tier, q.div, q.lp) > public._ladder_pos(pr.tier, pr.div, pr.lp)),
    'server_now', now());
end $$;

create or replace function public.update_profile(p_display_name text, p_group_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._uid(); dn text := left(trim(coalesce(p_display_name, '')), 12);
begin
  if dn = '' then raise exception 'BAD_DISPLAY_NAME'; end if;
  update profiles set display_name = dn, group_code = nullif(left(trim(coalesce(p_group_code, '')), 20), '')
   where id = uid;
  return public.get_me();
end $$;

create or replace function public.set_school(p_score int, p_grade int, p_sys int, p_mock int, p_show boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._uid(); sc jsonb;
begin
  if p_score is not null and (p_score < 0 or p_score > 100) then raise exception 'BAD_SCORE'; end if;
  if p_sys is not null and p_sys not in (5, 9) then raise exception 'BAD_SYS'; end if;
  if p_grade is not null and (p_grade < 1 or p_grade > coalesce(p_sys, 9)) then raise exception 'BAD_GRADE'; end if;
  if p_mock is not null and (p_mock < 1 or p_mock > 9) then raise exception 'BAD_MOCK'; end if;
  sc := jsonb_strip_nulls(jsonb_build_object('score', p_score, 'grade', p_grade, 'sys', coalesce(p_sys, 9),
                                             'mock', p_mock, 'updated_at', now()));
  update profiles set school = sc, a10 = public._academic10(sc), show_school = coalesce(p_show, false)
   where id = uid;
  perform public._refresh_eval(uid);
  return public.get_me();
end $$;

create or replace function public.start_session(p_kind text, p_level int, p_duel uuid default null, p_book text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._uid(); pr profiles; s sessions; dl duels; nn int; lvl int := p_level;
begin
  perform public._expire_sessions(uid);
  select * into s from sessions where user_id = uid and status = 'open';
  if found then
    if s.kind = p_kind and (p_duel is null or s.duel_id = p_duel) then return public._session_json(s); end if;
    raise exception 'OPEN_SESSION_EXISTS';
  end if;
  select * into pr from profiles where id = uid;

  if p_kind = 'placement' then
    if pr.tier is not null then raise exception 'ALREADY_PLACED'; end if;
    nn := 15;
  elsif p_kind = 'ranked' then
    if pr.tier is null then raise exception 'NEED_PLACEMENT'; end if;
    nn := least(20, greatest(10, (array[10,11,12,13,14,15,16,18,19,20])[pr.tier + 1] + floor(random() * 3)::int));
  elsif p_kind = 'duel' then
    select * into dl from duels where id = p_duel for update;
    if not found then raise exception 'DUEL_NOT_FOUND'; end if;
    if dl.status not in ('pending', 'active') or dl.created_at < now() - interval '3 days' then raise exception 'DUEL_CLOSED'; end if;
    if uid = dl.challenger then
      if dl.c_session is not null then raise exception 'DUEL_ALREADY_PLAYED'; end if;
    elsif uid = dl.opponent then
      if dl.status <> 'active' then raise exception 'DUEL_NOT_ACCEPTED'; end if;
      if dl.o_session is not null then raise exception 'DUEL_ALREADY_PLAYED'; end if;
    else
      raise exception 'NOT_YOUR_DUEL';
    end if;
    nn := dl.n; lvl := dl.level;
  else
    raise exception 'BAD_KIND';
  end if;
  if lvl is null or lvl not between 1 and 4 then raise exception 'BAD_LEVEL'; end if;

  insert into sessions(user_id, kind, duel_id, n, level, book)
  values (uid, p_kind, p_duel, nn, lvl, nullif(left(trim(coalesce(p_book, '')), 60), ''))
  returning * into s;
  if p_kind = 'duel' then
    if uid = dl.challenger then update duels set c_session = s.id where id = dl.id;
    else update duels set o_session = s.id where id = dl.id; end if;
  end if;
  return public._session_json(s);
end $$;

create or replace function public.finish_session(p_session uuid, p_marks text, p_book text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._uid(); s sessions; elapsed int; wrong int;
begin
  select * into s from sessions where id = p_session and user_id = uid for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status <> 'open' then raise exception 'SESSION_CLOSED'; end if;
  if p_marks is null or p_marks !~ '^[OX]+$' or length(p_marks) <> s.n then raise exception 'BAD_MARKS'; end if;
  elapsed := extract(epoch from now() - s.started_at)::int;
  if elapsed < s.n * 30 then raise exception 'TOO_FAST:%', s.n * 30 - elapsed; end if;
  wrong := length(p_marks) - length(replace(p_marks, 'X', ''));
  return public._finish(s, wrong, p_marks, coalesce(nullif(left(trim(coalesce(p_book, '')), 60), ''), s.book), false);
end $$;

create or replace function public.abandon_session(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._uid(); s sessions;
begin
  select * into s from sessions where id = p_session and user_id = uid and status = 'open' for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  return public._finish(s, s.n, repeat('X', s.n), s.book, true);
end $$;

create or replace function public.leaderboard(p_group text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.rank), '[]'::jsonb) from (
    select row_number() over (order by public._ladder_pos(p.tier, p.div, p.lp) desc, p.wins desc, p.created_at) as rank,
           p.username, p.display_name, p.group_code, p.tier, p.div, p.lp, p.wins, p.losses, p.streak,
           p.series->>'type' as series_type, p.eval->>'grade' as grade, p.last_played,
           case when p.show_school then p.a10 end as a10, p.id = auth.uid() as is_me
      from profiles p
     where p.tier is not null
       and (p_group is null or p_group = '' or p.group_code = p_group)
     order by public._ladder_pos(p.tier, p.div, p.lp) desc, p.wins desc, p.created_at
     limit 200) x
$$;

create or replace function public.get_profile(p_username text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._uid(); pr profiles;
begin
  select * into pr from profiles where username = lower(p_username);
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  return jsonb_build_object('profile', public._public_profile(pr, uid),
    'history', (select coalesce(jsonb_agg(h - 'marks'), '[]'::jsonb) from jsonb_array_elements(public._history(pr.id, 10)) h),
    'rank', case when pr.tier is null then null else (select count(*) + 1 from profiles q where q.tier is not null
              and public._ladder_pos(q.tier, q.div, q.lp) > public._ladder_pos(pr.tier, pr.div, pr.lp)) end);
end $$;

create or replace function public.create_duel(p_opponent text, p_level int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._uid(); opp profiles; d duels; cnt int;
begin
  select * into opp from profiles where username = lower(p_opponent);
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if opp.id = uid then raise exception 'CANNOT_DUEL_SELF'; end if;
  if p_level not between 1 and 4 then raise exception 'BAD_LEVEL'; end if;
  select count(*) into cnt from duels where challenger = uid and status in ('pending', 'active')
     and created_at > now() - interval '3 days';
  if cnt >= 5 then raise exception 'TOO_MANY_DUELS'; end if;
  insert into duels(challenger, opponent, level, n) values (uid, opp.id, p_level, 12) returning * into d;
  return public._duel_json(d, uid);
end $$;

create or replace function public.respond_duel(p_duel uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._uid(); d duels;
begin
  select * into d from duels where id = p_duel and opponent = uid for update;
  if not found then raise exception 'DUEL_NOT_FOUND'; end if;
  if d.status <> 'pending' then raise exception 'DUEL_CLOSED'; end if;
  update duels set status = case when p_accept then 'active' else 'declined' end where id = d.id returning * into d;
  return public._duel_json(d, uid);
end $$;

create or replace function public.my_duels() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._uid();
begin
  update duels set status = 'expired'
   where (challenger = uid or opponent = uid) and status in ('pending', 'active')
     and created_at < now() - interval '3 days';
  return (select coalesce(jsonb_agg(public._duel_json(d, uid) order by d.created_at desc), '[]'::jsonb)
            from (select * from duels where challenger = uid or opponent = uid
                   order by created_at desc limit 30) d);
end $$;

-- ---------------------------------------------------------------------
-- 5. 회원가입 시 프로필 자동 생성
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
begin
  if uname !~ '^[a-z0-9_]{3,16}$' then raise exception 'INVALID_USERNAME'; end if;
  insert into public.profiles(id, username, display_name, group_code)
  values (new.id, uname,
          left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), uname), 12),
          nullif(left(trim(coalesce(new.raw_user_meta_data->>'group_code', '')), 20), ''));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6. 권한: 테이블 직접 접근 금지, 공개 RPC만 허용
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.sessions, public.duels from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.ping(), public.username_available(text) to anon, authenticated;
grant execute on function
  public.get_me(), public.update_profile(text, text), public.set_school(int, int, int, int, boolean),
  public.start_session(text, int, uuid, text), public.finish_session(uuid, text, text),
  public.abandon_session(uuid), public.leaderboard(text), public.get_profile(text),
  public.create_duel(text, int), public.respond_duel(uuid, boolean), public.my_duels()
to authenticated;

-- 완료! 이제 Authentication > Sign In / Providers > Email 에서
-- "Confirm email" 을 끄면(OFF) 아이디/비밀번호만으로 가입할 수 있습니다.
