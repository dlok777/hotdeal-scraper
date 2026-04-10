const fetch = require("node-fetch");
const cheerio = require("cheerio");
const BaseCrawler = require("./BaseCrawler");
const fs = require("fs");
const puppeteer = require("puppeteer-core");

/**
 * 조드 사이트 크롤러 클래스
 * BaseCrawler를 상속받아 조드 특가 정보를 수집합니다.
 */
class Zod extends BaseCrawler {
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


  static _parsePrice(text) {
    if (!text) return 0;
    const normalized = text.replace(/\s+/g, " ").trim();
    const matchWon = normalized.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*원/);
    if (matchWon) {
      return parseInt(matchWon[1].replace(/,/g, ""), 10) || 0;
    }

    const matchManwon = normalized.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*만원/);
    if (matchManwon) {
      return (parseInt(matchManwon[1].replace(/,/g, ""), 10) || 0) * 10000;
    }

    return 0;
  }

  static _extractMetaValue($, scope, labelText) {
    // dl/dt/dd 구조
    const dts = $(scope).find("dt");
    for (const dt of dts) {
      const label = $(dt).text().replace(/\s+/g, " ").trim();
      if (label.includes(labelText)) {
        return (
          $(dt).next("dd").find("strong").first().text().trim() ||
          $(dt).next("dd").text().replace(/\s+/g, " ").trim()
        );
      }
    }

    // table/th/td 구조
    const ths = $(scope).find("th");
    for (const th of ths) {
      const label = $(th).text().replace(/\s+/g, " ").trim();
      if (label.includes(labelText)) {
        return $(th).next("td").text().replace(/\s+/g, " ").trim();
      }
    }
    return "";
  }

  static _parseProductsFromHtml(html) {
    const $ = cheerio.load(html);
    const products = [];
    const rows = $("ul.app-board-template-list.zod-board-list--deal > li");

    for (const row of rows) {
      const link = $(row).find("a.tw\\:flex-1").first();
      const href = (link.attr("href") || "").trim();
      const idMatch = href.match(/\/deal\/(\d+)/);
      if (!idMatch) continue;

      const productId = idMatch[1];
      const title = $(row).find(".app-list-title-item").first().text().trim();
      if (!title) continue;

      const seller =
        this._extractMetaValue($, row, "홈페이지/장소") ||
        this._extractMetaValue($, row, "홈페이지");

      products.push({
        id: productId,
        seller: seller,
        category: "zod",
        categoryTitle: "특가",
      });
    }

    return products;
  }

  static _isChallengeHtml(html) {
    if (!html) return false;
    const lowered = html.toLowerCase();
    return (
      lowered.includes("just a moment") ||
      lowered.includes("cf-challenge") ||
      lowered.includes("challenge-platform")
    );
  }

  static _extractDetailFromListSnapshot(productId) {
    if (!fs.existsSync("zod.html")) return null;
    const html = fs.readFileSync("zod.html", "utf8");
    if (!html) return null;

    const $ = cheerio.load(html);
    const link = $(`a.tw\\:flex-1[href='/deal/${productId}']`).first();
    if (!link.length) return null;

    const row = link.closest("li");
    const title = row.find(".app-list-title-item").first().text().trim();
    const seller =
      this._extractMetaValue($, row, "홈페이지/장소") ||
      this._extractMetaValue($, row, "홈페이지");
    const priceText = this._extractMetaValue($, row, "가격");
    const shippingText = this._extractMetaValue($, row, "배송비");
    let thumbnail = row.find(".app-thumbnail img").first().attr("src") || "";
    if (thumbnail.startsWith("//")) {
      thumbnail = `https:${thumbnail}`;
    } else if (thumbnail.startsWith("/")) {
      thumbnail = `https://zod.kr${thumbnail}`;
    }

    return {
      title,
      seller,
      price: this._parsePrice(priceText),
      freeShipping:
        shippingText.includes("무료") || shippingText.includes("무배")
          ? "Y"
          : "N",
      thumbnail,
    };
  }

  /**
   * 조드 상품 목록을 가져옵니다
   * @returns {Promise<Array>} 상품 목록 배열
   */
  static async getProducts() {
    let browser = null;
    try {
      const url = "https://zod.kr/deal";
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
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const html = await page.content();
      let products = this._parseProductsFromHtml(html);

      if (!products.length && !this._isChallengeHtml(html)) {
        const res = await fetch(url);
        const fallbackHtml = await res.text();
        products = this._parseProductsFromHtml(fallbackHtml);
        if (products.length) {
          fs.writeFileSync("zod.html", fallbackHtml);
        }
      } else if (products.length) {
        fs.writeFileSync("zod.html", html);
      }

      if (!products.length && fs.existsSync("zod.html")) {
        const localHtml = fs.readFileSync("zod.html", "utf8");
        products = this._parseProductsFromHtml(localHtml);
      }

      return products;
    } catch (error) {
      console.error(`${this.getCrawlerName()} 상품 목록 수집 오류:`, error.message);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * 조드 상품 상세 정보를 가져옵니다
   * @param {string} category - 카테고리 ID (미사용)
   * @param {string} productId - 상품 ID
   * @returns {Promise<Object>} 상품 상세 정보 객체
   */
  static async getProductDetail(category, productId) {
    let browser = null;
    try {
      const url = `https://zod.kr/deal/${productId}`;
      const executablePath = this._resolveBrowserExecutable();
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      // 상세 페이지 HTML을 puppeteer로 렌더링 후 저장
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      );
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const html = await page.content();
      fs.writeFileSync("product.html", html);
      const $ = cheerio.load(html);

      let title =
        $(".app-board-read .app-read-title, .board_read .title")
          .first()
          .text()
          .trim() ||
        $("meta[property='og:title']").attr("content") ||
        "";

      const comment =
        $(".board_read .xe_content, .app-board-read .xe_content")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim() || "";

      let productLink =
        $("tr[data-extravar-key='deal-link'] td a").first().attr("href") ||
        $(".board_read a[href^='http']").first().attr("href") ||
        $(".app-board-read a[href^='http']").first().attr("href");
      if (!productLink) {
        productLink = "";
      }

      let thumbnail =
        $("meta[property='og:image']").attr("content") ||
        $(".board_read img, .app-board-read img").first().attr("src") ||
        "";
      if (thumbnail && thumbnail.startsWith("//")) {
        thumbnail = `https:${thumbnail}`;
      }
      if (thumbnail && thumbnail.startsWith("/")) {
        thumbnail = `https://zod.kr${thumbnail}`;
      }

      const infoSection = $(".app-board-extra-value");
      let seller =
        $("tr[data-extravar-key='deal-mall'] td").first().text().trim() ||
        this._extractMetaValue($, infoSection, "쇼핑몰");
      const priceText =
        $("tr[data-extravar-key='deal-price'] td").first().text().trim() ||
        this._extractMetaValue($, infoSection, "가격") ||
        `${title} ${comment}`;
      const shippingText =
        $("tr[data-extravar-key='deal-parcel'] td").first().text().trim() ||
        this._extractMetaValue($, infoSection, "배송비");
      let price = this._parsePrice(priceText);

      let freeShipping =
        shippingText.includes("무료") ||
        shippingText.includes("무배") ||
        title.includes("무료") ||
        title.includes("무배") ||
        comment.includes("무료")
          ? "Y"
          : "N";

      let fallbackSeller = "";
      const shouldFallback =
        this._isChallengeHtml(html) || !title || !thumbnail || !seller;
      if (shouldFallback) {
        const snapshot = this._extractDetailFromListSnapshot(productId);
        if (snapshot) {
          fallbackSeller = snapshot.seller || "";
          if (!seller) {
            seller = snapshot.seller || "";
          }
          if (!title) {
            title = snapshot.title || "";
          }
          // 상세에서 가격 파싱이 실패했을 때만 fallback 가격 사용
          if (price === 0) {
            price = snapshot.price || 0;
          }
          if (!thumbnail) {
            thumbnail = snapshot.thumbnail || "";
          }
          if (freeShipping === "N" && snapshot.freeShipping === "Y") {
            freeShipping = "Y";
          }
        }
      }
      if (!seller) {
        seller = fallbackSeller;
      }
      if (!seller) {
        const sellerFromTitle = title.match(/^\s*\[([^\]]+)\]/);
        if (sellerFromTitle) {
          seller = sellerFromTitle[1].trim();
        }
      }

      return {
        id: productId,
        channel: 4,
        title: title,
        comment: comment,
        seller: seller,
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
    return "zod";
  }
  /**
   * 상품 제목을 정리하는 내부 메서드
   * @param {string} title - 원본 제목
   * @returns {string} 정리된 제목
   * @private
   */
  static _cleanTitle(title) {
    return title.replace(/\s+/g, " ").trim();
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

module.exports = Zod;
