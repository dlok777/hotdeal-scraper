# 🛒 Hotdeal Scraper

다양한 쇼핑 사이트에서 핫딜 상품 정보를 자동으로 수집하여 데이터베이스에 저장하는 Node.js 애플리케이션입니다.

## ✨ 주요 기능

- 🕷️ **다중 사이트 크롤링**: 확장 가능한 크롤러 아키텍처로 여러 쇼핑 사이트 지원
- 🗄️ **데이터베이스 저장**: MySQL 데이터베이스에 상품 정보 자동 저장
- ☁️ **S3 이미지 업로드**: 상품 이미지를 AWS S3에 자동 업로드
- 🔄 **중복 방지**: 이미 수집된 상품은 자동으로 스킵
- 📊 **상세 로깅**: 수집 과정 및 오류 상황 상세 기록

## 🏗️ 아키텍처

```
hotdeal-scraper/
├── app.js                 # 메인 애플리케이션
├── config.json           # 설정 파일
├── modules/
│   ├── BaseCrawler.js    # 크롤러 기본 클래스
│   ├── Ppomppu.js        # 뽐뿌 크롤러
│   ├── S3Uploader.js     # S3 업로드 유틸리티
│   └── Log.js            # 로깅 유틸리티
├── package.json          # 프로젝트 의존성
└── README.md            # 프로젝트 문서
```

## 🚀 시작하기

### 사전 요구사항

- Node.js 14.0 이상
- MySQL 5.7 이상
- AWS S3 계정 및 버킷

### 설치

1. **저장소 클론**
   ```bash
   git clone <repository-url>
   cd hotdeal-scraper
   ```

2. **의존성 설치**
   ```bash
   npm install
   ```

3. **설정 파일 작성**
   ```bash
   cp config.json.example config.json
   ```

4. **config.json 파일 설정**
   ```json
   {
     "host": "your-database-host",
     "user": "your-database-user",
     "password": "your-database-password",
     "database": "your-database-name",
     "access_key_id": "your-aws-access-key",
     "secret_access_key": "your-aws-secret-key"
   }
   ```

### 실행

```bash
node app.js
```

## 🔧 사용법

### 기본 실행

애플리케이션을 실행하면 설정된 모든 크롤러가 자동으로 실행됩니다:

```bash
node app.js
```

### 새로운 크롤러 추가

1. **BaseCrawler를 상속받는 새 크롤러 클래스 생성**

```javascript
// modules/NewSite.js
const BaseCrawler = require('./BaseCrawler');

class NewSite extends BaseCrawler {
  static async getProducts(category) {
    // 상품 목록 수집 로직 구현
    return products;
  }

  static async getProductDetail(category, productId) {
    // 상품 상세 정보 수집 로직 구현
    return detail;
  }

  static getCrawlerName() {
    return 'newsite';
  }

  static getSupportedCategories() {
    return ['category1', 'category2'];
  }
}

module.exports = NewSite;
```

2. **app.js에 새 크롤러 등록**

```javascript
// 크롤러 모듈들
const Ppomppu = require("./modules/Ppomppu");
const NewSite = require("./modules/NewSite"); // 추가

// ...

// 지원하는 크롤러 목록
this.crawlers = {
  ppomppu: Ppomppu,
  newsite: NewSite  // 추가
};

// ...

// 수집할 사이트 및 카테고리 목록
const crawlTargets = [
  { crawler: 'ppomppu', category: 'ppomppu' },
  { crawler: 'newsite', category: 'category1' }  // 추가
];
```

## 📁 현재 지원 사이트

### 🏪 뽐뿌 (Ppomppu)
- **사이트**: https://www.ppomppu.co.kr
- **카테고리**: ppomppu, freeboard
- **수집 정보**: 제품명, 가격, 판매자, 무료배송 여부, 썸네일 이미지

## 🛠️ 개발

### 프로젝트 구조 설명

#### BaseCrawler.js
모든 크롤러가 구현해야 할 공통 인터페이스를 정의하는 추상 클래스입니다.

**주요 메서드:**
- `getProducts(category)`: 상품 목록 수집
- `getProductDetail(category, productId)`: 상품 상세 정보 수집
- `getCrawlerName()`: 크롤러 이름 반환
- `getSupportedCategories()`: 지원 카테고리 목록 반환

#### S3Uploader.js
AWS S3에 이미지를 업로드하는 유틸리티 클래스입니다.

**주요 기능:**
- URL에서 이미지 다운로드
- 고유한 파일명 생성
- S3에 이미지 업로드
- 업로드된 URL 반환

#### Log.js
애플리케이션 로깅을 담당하는 유틸리티 클래스입니다.

### 코딩 가이드라인

1. **에러 처리**: 모든 비동기 작업에 try-catch 사용
2. **로깅**: 중요한 작업과 오류는 반드시 로그 기록
3. **설정**: 하드코딩 금지, config.json 사용
4. **문서화**: JSDoc 형식으로 함수 문서화

### 테스트

```bash
# 특정 크롤러만 테스트
node -e "
const Ppomppu = require('./modules/Ppomppu');
Ppomppu.getProducts('ppomppu').then(console.log);
"
```

## 🚨 문제 해결

### 자주 발생하는 오류

1. **인코딩 문제**
   - 한글이 깨질 때: `iconv-lite` 패키지로 EUC-KR → UTF-8 변환

2. **이미지 업로드 실패**
   - URL 형식 확인: `//`로 시작하는 상대 URL은 `https:` 추가

3. **데이터베이스 연결 실패**
   - config.json의 데이터베이스 설정 확인
   - 네트워크 연결 및 방화벽 설정 확인

4. **메모리 부족**
   - 대량 데이터 처리 시 배치 크기 조정

## 📝 로그

애플리케이션 실행 중 다음과 같은 로그가 출력됩니다:

```
🚀 핫딜 수집기 시작...
✅ 데이터베이스 연결 성공
✅ S3 업로더 초기화 완료

📊 ppomppu 사이트 처리 시작...
📦 25개 상품 발견
💾 상품 저장 완료: 제주 하우스 감귤 3kg 로얄과
💾 상품 저장 완료: 강아지 관절유산균 영양제
...
✅ ppomppu 처리 완료: 25개 확인, 12개 신규 저장

🎉 전체 처리 완료: 총 25개 상품 확인, 12개 신규 저장
📝 데이터베이스 연결 종료
```

## 🤝 기여

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이센스

이 프로젝트는 MIT 라이센스 하에 배포됩니다.

## 📞 지원

문제가 발생하거나 질문이 있으시면 이슈를 생성해 주세요.

---

**⚠️ 주의사항**: 
- 웹 크롤링 시 해당 사이트의 robots.txt와 이용약관을 준수해 주세요
- 과도한 요청으로 서버에 부하를 주지 않도록 적절한 딜레이를 사용하세요
- 수집된 데이터의 저작권과 개인정보보호 규정을 준수하세요