# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code(claude.ai/code)를 위한 가이드입니다.

## 명령어

```bash
npm start          # 스크래퍼 1회 실행 (node app.js)
```

빌드 단계, 린트 명령, 테스트 스위트는 없습니다. 주기 실행은 Docker를 사용합니다.

```bash
docker-compose up -d   # 스케줄러와 함께 실행 (RUN_INTERVAL_SECONDS마다 실행)
```

## 설정

스크래퍼는 아래 두 가지 방식 중 하나로 인증 정보를 받습니다.
1. **`config.json`** (로컬 개발): `config.json.example`을 복사한 뒤 DB + AWS 자격 정보를 입력
2. **`.env`** (Docker): `.env.example`을 복사 — docker-compose가 자동으로 읽음

필수 필드: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

## 아키텍처

### 데이터 흐름

```
app.js (HotdealScraper)
  → 각 크롤러 순회 (ppomppu, quasarzone, ruriweb, zod)
    → crawler.getProducts(category)         # 목록 페이지
    → crawler.getProductDetail(productId)   # 상세 페이지
    → _isProductExists()                    # DB 중복 확인
    → S3Uploader.uploadImageFromUrl()       # 썸네일 S3 업로드
    → classifyCategory()                    # 규칙 기반 AI 카테고리 분류
    → _saveProduct()                        # MySQL INSERT
```

### 핵심 모듈

- **`app.js`** — 오케스트레이터: `HotdealScraper` 클래스가 DB 연결, S3 업로더, 크롤러 레지스트리를 보유하고 전체 파이프라인을 실행합니다.
- **`modules/BaseCrawler.js`** — 모든 스크래퍼가 상속하는 추상 베이스 클래스입니다. 인터페이스는 `getProducts()`, `getProductDetail()`, `getCrawlerName()`, `getSupportedCategories()`, `normalizeProduct()`입니다.
- **`modules/{Site}.js`** — 사이트별 크롤러 파일입니다. 각 파일은 고유 `channel_idx`를 사용합니다 (1=Ppomppu, 2=Quasarzone, 3=Ruriweb, 4=Zod). cheerio로 사이트별 HTML 파싱을 처리합니다.
- **`modules/S3Uploader.js`** — axios로 이미지를 내려받아 `{folder}/{YYYY-MM-dd}/{timestamp}_{random}_{name}` 경로로 S3에 업로드하고, 공개 URL을 반환합니다.
- **`lib/categoryClassifier.js`** — 규칙 기반 분류기입니다. 2단계로 동작합니다: (1) 원본 `categoryTitle` 정규식 매칭, (2) `title + seller` 키워드 매칭. 반환값은 `APPLIANCE, DIGITAL, FOOD, LIVING, FASHION, BEAUTY, BABY, BOOK, SPORTS, AUTO, ETC` 중 하나입니다.
- **`modules/Log.js`** — 타임스탬프와 함께 컬러 콘솔 로그를 출력합니다 (info/warn/error/success).

### 데이터베이스 테이블

대상 테이블: `expertnote_channelProducts`  
핵심 컬럼: `channel_idx`, `channel_product_idx` (중복 제거용 복합 유니크 키), `title`, `price`, `thumbnail` (S3 URL), `ai_category`, `product_link`, `site_link`, `currency`, `free_shipping`

### 새 스크래퍼 추가

1. `BaseCrawler`를 상속하는 `modules/NewSite.js` 생성
2. 새로운 `channel_idx` 할당
3. `getProducts()`, `getProductDetail()`, `getCrawlerName()`, `getSupportedCategories()` 구현
4. `app.js`의 `crawlers` 객체에 등록

템플릿 뼈대는 `modules/Newsite.js`를 참고하세요.
