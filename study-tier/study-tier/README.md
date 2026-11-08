# 공부 티어 (Study Tier)

내 문제집으로 치르는 **수학 랭크 게임**입니다. 앱이 풀 문제 수(10~20개)를 정해 주면, 학생은 자기 문제집으로 풀고 답지로 채점해 O/X를 입력합니다. 결과에 따라 LP가 오르내리고 **아이언 → 브론즈 → 실버 → 골드 → 플래티넘 → 에메랄드 → 다이아몬드 → 마스터 → 그랜드마스터 → 챌린저**로 올라갑니다.

- 휴대폰, 아이패드, 노트북 어디서나 브라우저로 실행 (홈 화면에 추가하면 앱처럼 사용)
- 승급전(3판 2선승 / 티어 승급은 5판 3선승), 강등전(3판 2선승), 승급 후 3판 강등 보호
- 학교 성적(점수, 내신 등급, 모의고사 등급)을 반영한 배치고사, LP 보정, 정성평가
- 전체 랭킹과 반 랭킹, 친구 프로필, 1:1 대결
- 승급·강등·배치 결과 연출, 파티클, 효과음 (외부 이미지나 소리 파일 없이 코드로 생성)
- **완전 무료**: GitHub Pages(웹사이트) + Supabase 무료 플랜(서버·DB)

> 서버를 연결하지 않으면 **체험 모드**로 동작합니다. 기록은 그 기기에만 저장되고 가상 친구 16명과 경쟁합니다.

---

## 1. 준비물

| 항목 | 비용 | 비고 |
|---|---|---|
| GitHub 계정 | 무료 | 저장소는 **공개(Public)** 여야 무료로 GitHub Pages를 쓸 수 있어요 |
| Supabase 계정 | 무료 | 카드 등록 없이 가입. 무료 프로젝트 2개까지 |

## 2. 설치 (약 10분)

### ① GitHub에 올리기
1. GitHub에서 **New repository** → 이름 `study-tier` → **Public** → Create.
2. 이 폴더의 파일을 모두 올립니다. (웹에서는 **Add file → Upload files**에 폴더 안 파일들을 끌어다 놓기. `.github` 폴더도 함께 올려 주세요.)

### ② Supabase 서버 만들기
1. <https://supabase.com> 가입 → **New project**
   - Region: **Northeast Asia (Seoul)** 추천
   - Database password: 아무거나 길게 (따로 쓸 일은 거의 없어요)
2. 프로젝트가 만들어지면 왼쪽 메뉴 **SQL Editor** → **New query**.
3. 이 저장소의 [`supabase/schema.sql`](supabase/schema.sql) 내용을 **전부** 복사해 붙여넣고 **Run**.
   - `Success. No rows returned`가 나오면 성공입니다. 여러 번 실행해도 데이터는 지워지지 않아요.
4. 왼쪽 메뉴 **Authentication → Sign In / Providers → Email**에서 **Confirm email을 끄고(OFF)** 저장합니다.
   - 켜 두면 가입할 때마다 인증 메일이 가는데, 무료 메일 발송은 시간당 몇 통으로 제한돼서 반 친구들이 한꺼번에 가입할 수 없어요.

### ③ 웹앱과 서버 연결
1. Supabase 프로젝트 화면의 **Connect** 버튼(또는 **Project Settings → API Keys / Data API**)에서 두 값을 복사합니다.
   - **Project URL**: `https://xxxxxxxx.supabase.co`
   - **Publishable key** (`sb_publishable_...`) 또는 예전 이름 **anon public key**
2. GitHub 저장소에서 [`js/config.js`](js/config.js)를 열고 연필(✏️) 버튼으로 수정:
   ```js
   export const CONFIG = {
     SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
     SUPABASE_KEY: 'sb_publishable_xxxxxxxxxxxx',
   };
   ```
3. **Commit changes**.

> 이 키는 공개돼도 괜찮습니다. 데이터베이스 테이블은 직접 읽거나 쓸 수 없게 막혀 있고, 앱은 서버 함수로만 접근합니다. **`service_role` / secret 키는 절대 넣지 마세요.**

### ④ 웹사이트 켜기 (GitHub Pages)
1. 저장소 **Settings → Pages**
2. **Source: Deploy from a branch**, Branch: **main**, 폴더: **/(root)** → **Save**
3. 1~2분 뒤 `https://내아이디.github.io/study-tier/` 로 접속됩니다.

### ⑤ 휴대폰·아이패드에 설치
- **아이폰/아이패드(Safari)**: 사이트 접속 → 공유 버튼 → **홈 화면에 추가**
- **안드로이드/크롬**: 메뉴 → **앱 설치** 또는 **홈 화면에 추가**
- **노트북**: 브라우저로 접속하면 끝

---

## 3. 무료로 계속 쓰기 위한 주의점

- **Supabase 무료 프로젝트는 1주일 동안 아무 요청이 없으면 일시정지됩니다.** 데이터는 남아 있고, 대시보드에서 **Restore**를 누르면 무료로 다시 켜집니다.
- 이를 막기 위해 [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml)이 **3일마다 서버를 한 번 깨웁니다** (GitHub Actions, 공개 저장소는 무료).
  - 저장소 **Actions** 탭에서 워크플로를 한 번 켜(Enable) 주세요. **Run workflow**로 바로 시험할 수 있어요.
  - GitHub는 저장소에 60일간 변경이 없으면 예약 작업을 멈춥니다. 그때는 Actions 탭에서 다시 켜면 됩니다.
- 무료 한도: DB 500MB, 월 활성 사용자 5만 명, 전송량 월 5GB. 이 앱은 한 판 기록이 수백 바이트라 학교 여러 반이 써도 넉넉합니다.

## 4. 게임 규칙

| 문제집 수준 | 승리 조건 | 획득 LP |
|---|---|---|
| 개념·교과서 | 오답률 20% 이하 | ×0.85 |
| 유형·내신 | 오답률 30% 이하 | ×1.00 |
| 기출·모의고사 | 오답률 35% 이하 | ×1.10 |
| 심화·킬러 | 오답률 40% 이하 | ×1.25 |

- 결과: PERFECT(전부 정답, +28 기준) / 승리(+22) / 신승(+16) / 석패(-14) / 패배(-20) / 탈주(-25)
- 3연승부터 판마다 +3 보너스
- 티어가 오를수록 문제 수 증가: 아이언 10 ~ 챌린저 20문제
- 100 LP에서 승급전, 0 LP에서 지면 강등전. 마스터 300 LP에서 그랜드마스터, 600 LP에서 챌린저 승급전
- 배치고사(15문제): 결과와 학교 성적으로 첫 티어 결정 (최고 플래티넘 IV)
- **숨은 실력 점수(MMR)**: 최근 성적과 학업 지수(20%)로 계산. MMR이 지금 티어보다 높으면 이길 때 LP를 더 받고 질 때 덜 잃음 (최대 ±8)
- **정성평가**: 정확도 30%, 도전(문제집 수준) 20%, 꾸준함 15%, 성장세 10%, 학교 성적 25% → S+ ~ D 등급과 코멘트
- **대결**: 같은 수준 문제집으로 12문제. 오답이 적은 쪽 승리, 같으면 더 빨리 푼 쪽 승리. LP에는 영향 없음

### 공정성
- LP와 티어 계산은 **전부 서버(데이터베이스 함수)** 에서 합니다. 브라우저 개발자도구로 점수를 바꿀 수 없어요.
- 문제당 최소 30초가 지나야 제출됩니다. 3시간 안에 제출하지 않으면 탈주 처리됩니다.
- 시작한 판을 다시 시작해 문제 수를 바꿀 수 없습니다(같은 판이 이어집니다).
- 채점(O/X)은 학생 본인이 합니다. 문제 내용을 서버가 모르기 때문에 **정직한 채점**이 전제입니다.
- 학교 성적은 기본 비공개이고, 본인이 공개를 켜야 친구에게 학업 지수만 보입니다.

## 5. 관리

- 학생 목록과 기록: Supabase **Table Editor**의 `profiles`, `sessions`, `duels` 테이블
- 계정 삭제: **Authentication → Users**에서 삭제하면 기록도 함께 지워집니다
- 비밀번호 분실: 관리자가 Users 화면에서 해당 계정을 지우고 다시 가입하게 하거나, 메일 발송 설정 후 비밀번호 재설정 메일을 보낼 수 있습니다

## 6. 규칙 바꾸기 (개발자용)

규칙은 두 곳에 같은 내용으로 들어 있습니다.
- [`js/rules.js`](js/rules.js): 체험 모드와 화면 표시용
- [`supabase/schema.sql`](supabase/schema.sql): 실제 서버 계산

하나를 바꾸면 다른 쪽도 바꾸고, 아래 테스트로 두 계산이 같은지 확인하세요 (Node.js 18+와 Postgres 필요).

```bash
node scripts/test-rules.mjs                                   # 규칙 자체 테스트
createdb tier_test
psql -d tier_test -f tests/supabase_stub.sql -f supabase/schema.sql
node scripts/test-parity.mjs > parity.sql && psql -d tier_test -f parity.sql   # JS와 SQL 계산 비교 (mismatches 0이어야 함)
psql -d tier_test -f tests/integration.sql                    # 서버 함수 통합 테스트
```

## 파일 구조

```
index.html                 앱 진입점
css/style.css              디자인
js/app.js                  화면과 연출
js/rules.js                티어·LP·평가 규칙
js/emblems.js              티어 엠블럼 (SVG)
js/fx.js                   파티클, 화면 효과, 효과음
js/api.js                  Supabase 통신 (라이브러리 없이 REST 호출)
js/mock.js                 체험 모드 (로컬 저장)
js/config.js               서버 주소와 키  ← 여기만 수정
supabase/schema.sql        서버 DB와 함수 (SQL Editor에서 실행)
.github/workflows/keepalive.yml  서버 일시정지 방지
```
