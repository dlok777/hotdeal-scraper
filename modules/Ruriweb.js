const cheerio = require("cheerio");
const BaseCrawler = require("./BaseCrawler");
const fs = require("fs");
const puppeteer = require("puppeteer-core");

/**
 * 루리웹 사이트 크롤러 클래스
 * BaseCrawler를 상속받아 루리웹 사이트의 핫딜 정보를 수집합니다.
 */
class Ruriweb extends BaseCrawler {
  static _resolveBrowserExecutable() {
    const windowsCandidates = [];
    if (process.platform === "win32") {
      windowsCandidates.push(
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      );
    }

    const candidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      ...windowsCandidates,
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
    ].filter(Boolean);

    for (const executablePath of candidates) {
      if (fs.existsSync(executablePath)) {
        return executablePath;
      }
    }

    throw new Error(
      "Chromium/Chrome 실행 파일을 찾지 못했습니다. PUPPETEER_EXECUTABLE_PATH를 설정하거나 서버에 chromium을 설치하세요.",
    );
  }

  static async _gotoWithRetry(page, url, selector) {
    const attempts = [
      { waitUntil: "domcontentloaded", timeout: 45000 },
      { waitUntil: "load", timeout: 90000 },
    ];

    let lastError = null;
    for (const option of attempts) {
      try {
        await page.goto(url, option);
        if (selector) {
          await page.waitForSelector(selector, { timeout: 30000 });
        }
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  /**
   * 뽐뿌 상품 목록을 가져옵니다
   * @param {string} category - 카테고리 ID (예: 'ppomppu')
   * @returns {Promise<Array>} 상품 목록 배열
   */
  static async getProducts() {
    let browser = null;
    try {
      const url = `https://bbs.ruliweb.com/market/board/1020`;
      const executablePath = this._resolveBrowserExecutable();
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      );
      await this._gotoWithRetry(
        page,
        url,
        "table.board_list_table tbody tr, #board_list .table_body",
      );

      const html = await page.content();
      fs.writeFileSync("ruriweb-list.html", html);
      const $ = cheerio.load(html);
      const products = [];

      // 실제 게시글 행만 수집 (공지/베스트/광고 제외)
      const rows = $("table.board_list_table tbody tr.table_body.blocktarget");
      for (const row of rows) {
        const productId = $(row).find("td.id").first().text().trim();

        // 숫자 ID가 없는 행은 스킵
        if (!/^\d+$/.test(productId)) {
          continue;
        }

        const subjectText = $(row)
          .find("td.subject .subject_link")
          .first()
          .text()
          .trim();
        const sellerMatch = subjectText.match(/^\s*\[([^\]]+)\]/);
        const seller = sellerMatch ? sellerMatch[1].trim() : "";
        const categoryTitle = $(row).find("td.divsn a").first().text().trim();

        products.push({
          id: productId,
          seller: seller,
          category: "ruriweb",
          categoryTitle: categoryTitle,
        });
      }

      return products;
    } catch (error) {
      console.error(`${this.getCrawlerName()} 상품 목록 수집 오류:`, error);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * 뽐뿌 상품 상세 정보를 가져옵니다
   * @param {string} category - 카테고리 ID
   * @param {string} productId - 상품 ID
   * @returns {Promise<Object>} 상품 상세 정보 객체
   */
  static async getProductDetail(category, productId) {
    let browser = null;
    try {
      const url = `https://bbs.ruliweb.com/market/board/1020/read/${productId}?`;
      const executablePath = this._resolveBrowserExecutable();
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      // 상세 페이지 HTML 가져오기
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      );
      await this._gotoWithRetry(
        page,
        url,
        ".subject_inner_text, .board_main_view, #board_read",
      );
      const html = await page.content();
      fs.writeFileSync("ruriweb.html", html);
      const $ = cheerio.load(html);

      const title =
        $(".subject_inner_text").first().text().trim() ||
        $("meta[property='og:title']").attr("content") ||
        "";

      const comment = $(".board_main_view .view_content").text().trim();

      // 출처 링크 우선, 없으면 본문 내 첫 링크 사용
      let productLink = $(".source_url a").first().attr("href");
      if (!productLink) {
        productLink =
          $(".board_main_view .view_content a").first().attr("href") || "";
      }

      let thumbnail =
        $(".board_main_view .view_content img").first().attr("src") || "";
      if (thumbnail && thumbnail.startsWith("//")) {
        thumbnail = `https:${thumbnail}`;
      }

      // 제목/본문에서 가격 추출
      const priceText = `${title} ${comment}`;
      const wonMatch = priceText.match(/(\d{1,3}(?:,\d{3})*)\s*원/);
      const manwonMatch = priceText.match(/(\d+)\s*만원/);
      const parenMatch = priceText.match(/\((\d{1,3}(?:,\d{3})*)[\/,)]/);

      let price = 0;
      if (wonMatch) {
        price = parseInt(wonMatch[1].replace(/,/g, ""), 10) || 0;
      } else if (manwonMatch) {
        price = (parseInt(manwonMatch[1], 10) || 0) * 10000;
      } else if (parenMatch) {
        price = parseInt(parenMatch[1].replace(/,/g, ""), 10) || 0;
      }

      const freeShipping =
        title.includes("무료") ||
        title.includes("무배") ||
        comment.includes("무료") ||
        comment.includes("무배")
          ? "Y"
          : "N";

      return {
        id: productId,
        channel: 3,
        title: title,
        comment: comment,
        productLink: productLink,
        price: price,
        freeShipping: freeShipping,
        siteLink: url,
        thumbnail: thumbnail,
        currency: "KRW",
      };
    } catch (error) {
      console.error(`${this.getCrawlerName()} 상품 상세정보 수집 오류:`, error);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * 크롤러 이름 반환
   * @returns {string} 크롤러 이름
   */
  static getCrawlerName() {
    return "ruriweb";
  }
  /**
   * 상품 제목을 정리하는 내부 메서드
   * @param {string} title - 원본 제목
   * @returns {string} 정리된 제목
   * @private
   */
  static _cleanTitle(title) {
    return title
      .replace(/\)\s*\d{1,2}\s*$/, ")") // 마지막 ) 다음에 숫자 1-2개 제거 (괄호 내용은 유지)
      .trim();
  }

  // 하위 호환성을 위한 기존 메서드 유지 (Deprecated)
  /** @deprecated getProducts 사용을 권장합니다 */
  static async getList(id) {
    console.warn(
      "getList는 deprecated 메서드입니다. getProducts를 사용해주세요.",
    );
    return this.getProducts(id);
  }

  /** @deprecated getProductDetail 사용을 권장합니다 */
  static async getDetail(id, idx) {
    console.warn(
      "getDetail은 deprecated 메서드입니다. getProductDetail을 사용해주세요.",
    );
    return this.getProductDetail(id, idx);
  }
}

module.exports = Ruriweb;
