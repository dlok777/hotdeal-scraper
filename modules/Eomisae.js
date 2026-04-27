const fetch = require('node-fetch');
const cheerio = require('cheerio');
const BaseCrawler = require('./BaseCrawler');

class Eomisae extends BaseCrawler {
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
      .replace(/\s*-\s*기타정보\s*-\s*어미새\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static async getProducts() {
    try {
      const res = await fetch('https://eomisae.co.kr/rt', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        },
      });
      const html = await res.text();
      const $ = cheerio.load(html);
      const products = [];
      const seen = new Set();

      // 인기 게시물 (table._listA)
      $('table._listA tr').each((_, row) => {
        const noText = $(row).find('td.no').text().trim();
        if (noText === '공지') return;

        const link = $(row).find('td.title a[href^="/rt/"]').first();
        const href = link.attr('href') || '';
        const m = href.match(/^\/rt\/(\d+)$/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);

        const categoryTitle = $(row).find('td.title .cate').text().replace(/,/g, '').trim();
        products.push({ id: m[1], category: 'eomisae', categoryTitle });
      });

      // 일반 카드형 목록 (.card_el)
      $('.bd_card .card_el').each((_, el) => {
        const link = $(el).find('h3 a[href^="/rt/"]').first();
        const href = link.attr('href') || '';
        const m = href.match(/^\/rt\/(\d+)$/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);

        const thumbnail = $(el).find('img.tmb').first().attr('src') || '';
        const categoryTitle = $(el).find('.cate').text().replace(/,/g, '').trim();
        products.push({
          id: m[1],
          category: 'eomisae',
          categoryTitle,
          thumbnail: thumbnail.startsWith('//') ? `https:${thumbnail}` : thumbnail,
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
      const siteLink = `https://eomisae.co.kr/rt/${productId}`;
      const res = await fetch(siteLink, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        },
      });
      const html = await res.text();
      const $ = cheerio.load(html);

      const rawTitle = $('meta[property="og:title"]').attr('content') || '';
      const title = this._cleanTitle(rawTitle);

      const thumbnail = $('meta[property="og:image"]').attr('content') || '';

      // 구매 링크: et_vars 테이블 첫 번째 행 a 태그에서 추출
      // 제휴 링크인 경우 tu= 파라미터로 실제 URL 복원
      let productLink = '';
      const etRow = $('table.et_vars tr').first();
      if (etRow.length) {
        const linkHref = etRow.find('td a').first().attr('href') || '';
        const tuMatch = linkHref.match(/[?&]tu=([^&]+)/);
        productLink = tuMatch ? decodeURIComponent(tuMatch[1]) : linkHref;
      }

      // 작성자 = 게시물 첫 번째 member_* 요소
      let seller = '';
      $('[class*="member_"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text && !seller) {
          seller = text;
        }
      });

      const price = this._parsePrice(title);
      const freeShipping = this._isFreeShipping(title) ? 'Y' : 'N';

      return {
        id: productId,
        channel: 5,
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
    return 'eomisae';
  }

  static getSupportedCategories() {
    return ['eomisae'];
  }
}

module.exports = Eomisae;
