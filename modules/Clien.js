const fetch = require('node-fetch');
const cheerio = require('cheerio');
const BaseCrawler = require('./BaseCrawler');

const BASE_URL = 'https://www.clien.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

class Clien extends BaseCrawler {
  static _parsePrice(text) {
    if (!text) return 0;
    const normalized = text.replace(/\s+/g, ' ').trim();
    const matchWon = normalized.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*원/);
    if (matchWon) return parseInt(matchWon[1].replace(/,/g, ''), 10) || 0;
    const matchManwon = normalized.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*만원/);
    if (matchManwon) return (parseInt(matchManwon[1].replace(/,/g, ''), 10) || 0) * 10000;
    return 0;
  }

  static _isFreeShipping(text) {
    return text.includes('무배') || text.includes('무료배송') || text.includes('무료');
  }

  static _cleanTitle(raw) {
    return raw
      .replace(/\s*:\s*클리앙\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static _extractSeller(title) {
    const m = title.match(/^\s*\[([^\]]+)\]/);
    return m ? m[1].trim() : '';
  }

  // Clien CDN은 ?scale=width:480 파라미터가 있어야 정상 응답
  static _normalizeImageUrl(imageUrl) {
    if (!imageUrl) return imageUrl;
    return `${imageUrl.split('?')[0]}?scale=width:480`;
  }

  static async getProducts() {
    try {
      const res = await fetch(`${BASE_URL}/service/board/jirum`, {
        headers: { 'User-Agent': UA },
      });
      const html = await res.text();
      const $ = cheerio.load(html);
      const products = [];
      const seen = new Set();

      $('.list_item').each((_, item) => {
        if ($(item).hasClass('notice')) return;

        const link = $(item).find('a[href*="/service/board/jirum/"]').first();
        const href = link.attr('href') || '';
        const m = href.match(/\/service\/board\/jirum\/(\d+)/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);

        const title = $(item).find('.list_subject').text().replace(/\s+/g, ' ').trim();
        const rawThumb = $(item).find('.list_thumbnail img').attr('src') || '';
        const categoryTitle = $(item).find('.icon_keyword').text().trim();

        products.push({
          id: m[1],
          category: 'clien',
          categoryTitle,
          title,
          thumbnail: this._normalizeImageUrl(rawThumb),
        });
      });

      return products;
    } catch (error) {
      console.error(`${this.getCrawlerName()} 상품 목록 수집 오류:`, error.message);
      return [];
    }
  }

  static async getProductDetail(category, productId) {
    try {
      const siteLink = `${BASE_URL}/service/board/jirum/${productId}`;
      const res = await fetch(siteLink, {
        headers: { 'User-Agent': UA },
      });
      const html = await res.text();
      const $ = cheerio.load(html);

      const rawTitle = $('meta[property="og:title"]').attr('content') || '';
      const title = this._cleanTitle(rawTitle);

      // og:image 우선, 없으면 undefined (목록에서 가져온 thumbnail 유지)
      const ogImage = $('meta[property="og:image"]').attr('content');
      const thumbnail = ogImage ? this._normalizeImageUrl(ogImage) : undefined;

      let productLink = '';
      const linkEl = $('.attached_link .url').first();
      if (linkEl.length) {
        const href = linkEl.attr('href') || '';
        const tuMatch = href.match(/[?&]tu=([^&]+)/);
        productLink = tuMatch ? decodeURIComponent(tuMatch[1]) : (linkEl.text().trim() || href);
      }

      const seller =
        this._extractSeller(title) ||
        $('.nickname span').first().text().trim();

      const price = this._parsePrice(title);
      const freeShipping = this._isFreeShipping(title) ? 'Y' : 'N';

      return {
        id: productId,
        channel: 6,
        title,
        seller,
        thumbnail,
        price,
        freeShipping,
        productLink,
        siteLink,
        currency: 'KRW',
      };
    } catch (error) {
      console.error(`${this.getCrawlerName()} 상품 상세정보 수집 오류:`, error.message);
      return null;
    }
  }

  static getCrawlerName() {
    return 'clien';
  }

  static getSupportedCategories() {
    return ['clien'];
  }
}

module.exports = Clien;
