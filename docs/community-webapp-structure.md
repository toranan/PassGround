# 커뮤니티 웹앱 구조 정리

이 문서는 "보통의 커뮤니티 웹앱" 구조를 현재 코드베이스(`apps/web`, `apps/ios`)에 맞춰 매핑한 운영 기준 문서다.

## 1) 일반적인 커뮤니티 웹앱 구조

커뮤니티 서비스는 보통 아래 4층으로 나뉜다.

1. 페이지 라우팅(UI)
2. API 라우팅(서버 엔드포인트)
3. 도메인/데이터 계층(DB, 인증, 권한)
4. 클라이언트(iOS/웹 프론트) 소비 계층

현재 프로젝트도 동일한 형태이며, Next.js App Router + Supabase + iOS API 소비 구조다.

## 2) 현재 프로젝트 매핑

### Web UI (Next.js)
- 메인 커뮤니티 진입: `apps/web/app/community/page.tsx`
- 시험별 커뮤니티 홈: `apps/web/app/community/[exam]/page.tsx`
- 게시판 목록: `apps/web/app/c/[exam]/[board]/page.tsx`
- 게시글 상세: `apps/web/app/c/[exam]/[board]/[postId]/page.tsx`
- 글쓰기: `apps/web/app/c/[exam]/[board]/write/page.tsx`

### Mobile API (iOS에서 직접 호출하는 라우트)
- 게시판 목록: `apps/web/app/api/mobile/boards/[exam]/route.ts`
- 게시글 목록: `apps/web/app/api/mobile/posts/route.ts`
- 게시글 상세: `apps/web/app/api/mobile/posts/[postId]/route.ts`

### 공통 도메인/시드
- 게시판/시험 카테고리 정의: `apps/web/lib/data.ts`
- 서버 DB 접근: `apps/web/lib/supabaseServer.ts`, `apps/web/lib/supabaseAdmin.ts`

## 3) iOS 연동 포인트

iOS 앱은 아래 API를 기준으로 동작한다.

- `GET /api/mobile/boards/:exam`
- `GET /api/mobile/posts?exam=...&board=...`
- `GET /api/mobile/posts/:postId?exam=...&board=...`

관련 클라이언트 코드:
- `apps/ios/HapgyeokpanApp/HapgyeokpanApp/Core/APIClient.swift`

기본 서버 주소:
- `apps/ios/HapgyeokpanApp/HapgyeokpanApp/Core/AppConfig.swift`
- 기본값은 `https://pass-ground.vercel.app`

## 4) "HTML 404 반환" 이슈 의미

iOS에서 `서버가 JSON이 아닌 HTML을 반환` + `HTTP 404`가 보이면, 거의 항상 아래 둘 중 하나다.

1. 배포 서버에 `/api/mobile/*` 라우트가 실제로 올라가 있지 않음
2. Vercel 프로젝트 Root Directory/브랜치/배포 대상이 `apps/web`와 불일치

즉, iOS 문제라기보다 "배포된 웹 서버 라우팅 문제"일 가능성이 높다.

## 5) 배포 점검 체크리스트 (Vercel)

1. Project Root Directory가 `apps/web`인지 확인
2. Build Command가 `next build`로 실행되는지 확인
3. 실제 배포 브랜치에 `app/api/mobile/*` 파일이 포함되어 있는지 확인
4. 배포 후 아래 URL을 브라우저/터미널에서 직접 확인

```bash
curl -i 'https://pass-ground.vercel.app/api/mobile/boards/transfer'
curl -i 'https://pass-ground.vercel.app/api/mobile/posts?exam=transfer&board=qa'
```

정상이라면 `content-type: application/json` + `200` 또는 의미 있는 JSON 에러(`4xx + {"error":"..."}`)가 반환되어야 한다.

## 6) Xcode 로그/오류 확인 기준

`APIClient.swift`에 네트워크 로깅과 DEBUG assert가 추가되어 있다.

- 요청 로그: `REQ <METHOD> <URL>`
- 응답 로그: `RES <STATUS> <URL> bytes=<N>`
- 전송 에러: `TRANSPORT_ERROR ...`
- HTTP 에러: `HTTP_ERROR ...`

DEBUG 빌드에서는 네트워크/디코딩/HTTP 실패 시 `assertionFailure`가 발생해 Xcode에서 즉시 원인 URL/상태코드를 확인할 수 있다.
