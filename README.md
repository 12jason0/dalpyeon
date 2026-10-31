# 우리주기

말하기 어려운 날에도, 서로의 편.
생리 주기 기록 · 다음 생리 예상 · 커플 연결 · 오늘 필요한 배려를 주고받는 모바일 웹.

Next.js 16 (App Router) + TypeScript + Tailwind 4 + Drizzle + PostgreSQL. Vercel 배포 기준.

## 로컬 실행

```bash
npm install
npm run dev        # http://localhost:3000
```

`DATABASE_URL`이 비어 있으면 프로젝트 안 `.pglite/` 폴더에 내장 Postgres(PGlite)를 만들어 씁니다. DB 설치가 필요 없습니다.
초기화하려면 `.pglite` 폴더를 지우면 됩니다.

두 사람 흐름을 시험하려면 일반 창 + 시크릿 창으로 각각 가입하세요. 누구나 기록자로 시작하고, 받은 코드를 입력해 승인받은 사람이 파트너가 됩니다.

## 테스트

```bash
npm test           # 예측 로직 + 서비스 로직 (19개)
```

- `tests/prediction.test.ts` — 원본 Python `test_prediction.py`를 그대로 옮긴 것 + 경계 케이스
- `tests/services.test.ts` — 가입·로그인, 기록, 연결, 공유 조건, 배려 요청·답장 (메모리 DB로 실행)

## 알림 설정

웹 푸시는 VAPID 키가 있어야 켜집니다. 키는 한 번만 만들고, 바꾸면 기존 구독이 모두 끊깁니다.

```bash
npx web-push generate-vapid-keys
```

아래 값을 `.env.local`과 Vercel 환경변수에 넣으세요. 비밀 키는 저장소에 올리지 마세요.

```
VAPID_PUBLIC_KEY=만든 공개 키
VAPID_PRIVATE_KEY=만든 비밀 키
VAPID_SUBJECT=mailto:12jason@naver.com
CRON_SECRET=길고 무작위인 값
```

예정일 알림은 Vercel Cron이 매일 09:00(한국 시간)에 `/api/cron/reminders`를 부릅니다. Vercel이 `CRON_SECRET`을 Authorization 헤더로 보내며, 값이 비어 있으면 모든 호출을 거부합니다.

아이폰은 Safari에서 "홈 화면에 추가"한 앱에서만 알림을 받을 수 있습니다.

## 배포 (Vercel + Neon)

1. Neon에서 **새 프로젝트**를 만들고 연결 문자열(Pooled)을 복사
2. 프로젝트 폴더에 `.env.local` 만들고 `DATABASE_URL=복사한값` 저장
3. `npm run db:migrate` — Neon에 테이블 생성 (`drizzle/` 폴더의 SQL 적용)
4. GitHub에 올리고 Vercel에서 Import → 환경변수 `DATABASE_URL` 추가 → Deploy
5. 아이폰 Safari로 접속 → 공유 → **홈 화면에 추가**

스키마(`src/lib/db/schema.ts`)를 바꾸면 `npm run db:generate`로 SQL을 만들고 `npm run db:migrate`로 적용합니다.
`drizzle-kit push`는 쓰지 않습니다 (DB에 다른 테이블이 있으면 지우자고 제안할 수 있음).

## 구조

```
src/lib/prediction.ts       주기 예측 v1 (순수 함수)
src/lib/services/           DB 로직 — 화면과 분리돼 있어서 테스트 가능
  auth.ts                   가입·로그인·세션·요청 제한
  periods.ts                생리 기록, 오늘 며칠째
  couples.ts                초대 코드·승인·공유 설정·연결 해제
  care.ts                   오늘 필요한 배려 요청·답장
  partner.ts                파트너 화면 데이터 (공유 조건을 여기서 한 번에 거름)
  community.ts              파트너 커뮤니티 (글·댓글·신고·차단). 운영자 지정: npm run admin:grant -- 이메일
src/app/actions.ts          화면에서 부르는 서버 액션
src/app/page.tsx            오늘 (기록자 / 파트너 화면)
src/app/records/            지난 기록 입력·수정
src/app/connect/            연결·공유 설정·로그아웃
drizzle/                    DB 마이그레이션 SQL
```

## 지키는 규칙

- 기록 조회·수정은 항상 로그인한 사람 기준. 요청에 담긴 ID를 믿지 않음
- 연결해도 공유는 **전부 꺼진 상태**로 시작. 항목(생리 기록 / 다음 생리 예상 / 가임기 / 배려 요청)별로 켬
- 파트너가 보는 조건 = 활성 연결 AND 일시정지 아님 AND 항목 허용 AND 공유 시작일 이후
- 예측을 공유해도 계산에 쓴 과거 기록·간격은 파트너에게 안 내려감
- 배려 요청 내용이 바뀌면 이전 답장은 초기화
- 예측은 저장하지 않고 매번 계산. 기록 4번(간격 3개) 전엔 예측하지 않음. 들쭉날쭉하면 가임기 숨김
- 날짜는 Asia/Seoul 기준
- 비밀번호는 scrypt 해시, 세션은 HttpOnly 쿠키(30일). 서버엔 세션 값의 해시만 저장
- 로그인·가입·코드 입력은 IP·계정별 횟수 제한 (`x-forwarded-for` 첫 IP 기준)

## 아직 안 한 것

- 비밀번호 재설정 (이메일 발송 필요)
- 계정 삭제
- 푸시 알림 (지금은 앱을 열어야 확인)
- 증상(통증·기분) 기록, 예측 제외 요인(임신·피임) 입력 화면 — 예측 함수는 이미 지원
- 의료적으로 검증된 예측이 아님. 피임·배란 확인에 쓸 수 없음
