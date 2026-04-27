/**
 * 핫딜 상품 수집 및 데이터베이스 저장 메인 애플리케이션
 *
 * 이 애플리케이션은 다양한 쇼핑몰 사이트에서 핫딜 상품 정보를 수집하여
 * 데이터베이스에 저장하고, 상품 이미지를 S3에 업로드합니다.
 */

const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs");
const log = require("./modules/Log");
const { classifyCategory } = require("./lib/categoryClassifier");

// 크롤러 모듈들
const Ppomppu = require("./modules/Ppomppu");
// TODO: 향후 추가될 크롤러들
// const Gmarket = require("./modules/Gmarket");
// const Coupang = require("./modules/Coupang");
// 퀘이사존
const Quasarzone = require("./modules/Quasarzone");

// 루리웹
const Ruriweb = require("./modules/Ruriweb");

// 조드
const Zod = require("./modules/Zod");

// 어미새
const Eomisae = require("./modules/Eomisae");

// 클리앙
const Clien = require("./modules/Clien");
// 유틸리티 모듈들
const S3Uploader = require("./modules/S3Uploader");

/**
 * 메인 애플리케이션 클래스
 */
class HotdealScraper {
  constructor() {
    this.config = this._loadConfig();
    this.db = null;
    this.s3Uploader = null;

    // 지원하는 크롤러 목록
    this.crawlers = {
      ppomppu: Ppomppu,
      quasarzone: Quasarzone,
      // ruriweb: Ruriweb,
      zod: Zod,
      eomisae: Eomisae,
      clien: Clien,
      // gmarket: Gmarket,
      // coupang: Coupang
    };
  }

  /**
   * 설정 파일 로드
   * @returns {Object} 설정 객체
   * @private
   */
  _loadConfig() {
    try {
      const configPath = path.resolve(__dirname, "config.json");
      let fileConfig = {};
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, "utf8");
        fileConfig = JSON.parse(configData);
      }

      // Docker/CI 환경에서는 환경변수 우선으로 설정을 주입한다.
      return {
        host: process.env.DB_HOST || fileConfig.host,
        user: process.env.DB_USER || fileConfig.user,
        password: process.env.DB_PASSWORD || fileConfig.password,
        database: process.env.DB_NAME || fileConfig.database,
        access_key_id:
          process.env.AWS_ACCESS_KEY_ID || fileConfig.access_key_id,
        secret_access_key:
          process.env.AWS_SECRET_ACCESS_KEY || fileConfig.secret_access_key,
      };
    } catch (error) {
      console.error("설정 파일 로드 실패:", error);
      process.exit(1);
    }
  }

  /**
   * 데이터베이스 연결 초기화
   * @returns {Promise<void>}
   * @private
   */
  async _initDatabase() {
    try {
      this.db = await mysql.createConnection({
        host: this.config.host,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
      });

      await this.db.connect();
      console.log("✅ 데이터베이스 연결 성공");
    } catch (error) {
      await log.error("데이터베이스 연결 실패:", error);
      throw error;
    }
  }

  /**
   * S3 업로더 초기화
   * @private
   */
  _initS3Uploader() {
    this.s3Uploader = new S3Uploader({
      accessKeyId: this.config.access_key_id,
      secretAccessKey: this.config.secret_access_key,
      region: "ap-northeast-2",
      bucket: "record-php",
    });
    console.log("✅ S3 업로더 초기화 완료");
  }

  /**
   * 애플리케이션 실행
   * @returns {Promise<void>}
   */
  async run() {
    try {
      console.log("🚀 핫딜 수집기 시작...");

      // 초기화
      await this._initDatabase();
      this._initS3Uploader();

      // 수집할 사이트 및 카테고리 목록
      const crawlTargets = [
        { crawler: "ppomppu", category: "ppomppu" },
        { crawler: "quasarzone", category: "quasarzone" },
        // { crawler: "ruriweb", category: "ruriweb" },
        { crawler: "zod", category: "zod" },
        { crawler: "eomisae", category: "eomisae" },
        { crawler: "clien", category: "clien" },
        // { crawler: 'gmarket', category: 'hotdeal' },
        // { crawler: 'coupang', category: 'rocket' }
      ];

      let totalProcessed = 0;
      let totalSaved = 0;

      // 각 크롤러별로 상품 수집 및 처리
      for (const target of crawlTargets) {
        console.log(`\n📊 ${target.crawler} 사이트 처리 시작...`);

        const result = await this._processCrawler(
          target.crawler,
          target.category,
        );
        totalProcessed += result.processed;
        totalSaved += result.saved;

        console.log(
          `✅ ${target.crawler} 처리 완료: ${result.processed}개 확인, ${result.saved}개 신규 저장`,
        );
      }

      console.log(
        `\n🎉 전체 처리 완료: 총 ${totalProcessed}개 상품 확인, ${totalSaved}개 신규 저장`,
      );
    } catch (error) {
      console.error("❌ 애플리케이션 실행 중 오류:", error);
      await log.error("메인 애플리케이션 오류:", error);
    } finally {
      // 리소스 정리
      if (this.db) {
        await this.db.end();
        console.log("📝 데이터베이스 연결 종료");
      }
    }
  }

  /**
   * 특정 크롤러로 상품 수집 및 처리
   * @param {string} crawlerName - 크롤러 이름
   * @param {string} category - 카테고리
   * @returns {Promise<{processed: number, saved: number}>} 처리 결과
   * @private
   */
  async _processCrawler(crawlerName, category) {
    const CrawlerClass = this.crawlers[crawlerName];
    if (!CrawlerClass) {
      throw new Error(`지원하지 않는 크롤러: ${crawlerName}`);
    }

    let processed = 0;
    let saved = 0;

    try {
      // 상품 목록 가져오기
      const products = (await CrawlerClass.getProducts(category)).reverse();

      // 각 상품 처리
      for (const product of products) {
        processed++;

        try {
          // 이미 존재하는 상품인지 확인
          if (await this._isProductExists(product.id)) {
            continue;
          }

          // 상품 상세 정보 가져오기
          const detail = await CrawlerClass.getProductDetail(
            category,
            product.id,
          );
          if (!detail) {
            console.warn(`⚠️  상품 상세정보 수집 실패: ${product.id}`);
            continue;
          }

          // 상품 데이터 병합
          const productData = { ...product, ...detail };
          // 상품 금액이 10원 밑이면 continue
          // if(productData.price < 10) {
          //   continue;
          // }

          // 썸네일 이미지 S3 업로드
          let thumbnailUrl = null;
          if (productData.thumbnail) {
            thumbnailUrl = await this.s3Uploader.uploadImageFromUrl(
              productData.thumbnail,
              "hotdeal",
            );
          }

          // 데이터베이스에 저장
          await this._saveProduct(productData, thumbnailUrl);
          saved++;

          console.log(`💾 상품 저장 완료: ${productData.title}`);
        } catch (error) {
          console.error(
            `❌ 상품 처리 실패 (ID: ${product.id}):`,
            error.message,
          );
          continue;
        }
      }
    } catch (error) {
      console.error(`❌ ${crawlerName} 크롤러 처리 실패:`, error);
      throw error;
    }

    return { processed, saved };
  }

  /**
   * 상품이 이미 데이터베이스에 존재하는지 확인
   * @param {string} productId - 상품 ID
   * @returns {Promise<boolean>} 존재 여부
   * @private
   */
  async _isProductExists(productId) {
    const sql =
      "SELECT COUNT(*) as count FROM expertnote_channelProducts WHERE channel_product_idx = ?";
    const [rows] = await this.db.query(sql, [productId]);
    return rows[0].count > 0;
  }

  /**
   * 상품 정보를 데이터베이스에 저장
   * @param {Object} productData - 상품 데이터
   * @param {string|null} thumbnailUrl - 썸네일 S3 URL
   * @returns {Promise<void>}
   * @private
   */
  async _saveProduct(productData, thumbnailUrl) {
    // title 앞에 [seller_title] 형식이 있으면 제거
    let title = productData.title || '';
    if (productData.seller) {
      const escaped = productData.seller.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      title = title.replace(new RegExp(`^\\s*\\[${escaped}\\]\\s*`), '').trim();
    }

    const aiCategory = classifyCategory({
      title: title,
      sellerTitle: productData.seller,
      categoryTitle: productData.categoryTitle,
    });

    const sql = `
      INSERT INTO expertnote_channelProducts
      (channel_idx, channel_product_idx, category_title, ai_category, seller_title, title, price, free_shipping, thumbnail, product_link, site_link, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      productData.channel, // 뽐뿌: 1, 퀘이사존: 2
      productData.id,
      productData.categoryTitle || "",
      aiCategory,
      productData.seller || "",
      title,
      productData.price || 0,
      productData.freeShipping || "N",
      thumbnailUrl || productData.thumbnail || "",
      productData.productLink || "",
      productData.siteLink || "",
      productData.currency || "KRW",
    ];

    await this.db.query(sql, values);
  }
}

/**
 * 애플리케이션 진입점
 */
(async () => {
  // let ppomppu = await Ppomppu.getProductDetail('ppomppu'
  //
  // , 640313);
  // console.log(ppomppu);
  // return;

  // let quasarzone = await Quasarzone.getProductDetail(1831436);
  // let quasarzone = await Quasarzone.getProducts(1831436);

  // let ruriweb = await Ruriweb.getProducts();
  // let product = await Ruriweb.getProductDetail("", 103217);
  
  // console.log(ruriweb);

  const scraper = new HotdealScraper();
  await scraper.run();
})();
