const fetch = require('node-fetch');
const cheerio = require("cheerio");
const iconv = require('iconv-lite');
const BaseCrawler = require('./BaseCrawler');
const fs = require('fs');

/**
 * 뽐뿌 사이트 크롤러 클래스
 * BaseCrawler를 상속받아 뽐뿌 사이트의 핫딜 정보를 수집합니다.
 */
class Quasarzone extends BaseCrawler {
  /**
   * 뽐뿌 상품 목록을 가져옵니다
   * @param {string} category - 카테고리 ID (예: 'ppomppu')
   * @returns {Promise<Array>} 상품 목록 배열
   */
  static async getProducts(category) {
    try {
      const url = `https://www.ppomppu.co.kr/zboard/zboard.php?id=${category}`;
      
      // 뽐뿌 사이트에서 HTML 가져오기 (EUC-KR 인코딩 처리)
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      const html = iconv.decode(Buffer.from(buffer), 'euc-kr');
      const $ = cheerio.load(html);
  
      const list = $("#revolution_main_table").find('.baseList');
      const products = [];

      // 각 상품 정보 파싱
      for(let item of list) {
        const productId = $(item).find('.baseList-numb').text().trim();
  
        // 상품 ID가 없으면 스킵
        if(!productId) {
          continue;
        }
  
        // 판매자 정보 파싱 (대괄호 제거)
        const seller = $(item).find('.subject_preface').text().trim().replace(/[\[\]]/g, '');
        
        // 썸네일 이미지 URL
        const thumbnail = $(item).find('.baseList-thumb img').attr('src');
        
        // 상품 제목 파싱 (b 태그 우선, 없으면 전체 텍스트)
        let title = $(item).find('.baseList-title b').text().trim() || 
                    $(item).find('.baseList-title').text().trim().replace(`[${seller}]`, '').trim();

        // 제목 정리: 대괄호 및 가격 정보 제거
        title = this._cleanTitle(title);
        let categoryTitle = $(item).find('.baseList-small').text().trim().replace(/[\[\]]/g, '');

        const productData = {
          id: productId,
          // title: title,
          seller: seller,
          // thumbnail: thumbnail,
          category: category,
          categoryTitle: categoryTitle
        };

        products.push(productData);  
      }
  
      return products;
    } catch (error) {
      console.error(`${this.getCrawlerName()} 상품 목록 수집 오류:`, error);
      return [];
    }
  }

  /**
   * 뽐뿌 상품 상세 정보를 가져옵니다
   * @param {string} category - 카테고리 ID
   * @param {string} productId - 상품 ID
   * @returns {Promise<Object>} 상품 상세 정보 객체
   */
  static async getProductDetail(productId) {
    try {


      const url = `https://quasarzone.com/bbs/qb_saleinfo/views/${productId}`;

      // 상세 페이지 HTML 가져오기
      const res = await fetch(url);

      // const buffer = await res.arrayBuffer();
      // const html = iconv.decode(Buffer.from(buffer), 'euc-kr');
      const html = await res.text();
      fs.writeFileSync('quasarzone.html', html);
      const $ = cheerio.load(html);
      let label = $(".common-view-area .label").text().trim();
      let title = $(".common-view-area .title").text().replace(label, "").trim();
      let seller = '';
      const sellerMatch = title.match(/^\[([^\]]+)\]/);
      if (sellerMatch) {
        seller = sellerMatch[1]; // 대괄호 안의 내용을 seller로 저장
        title = title.replace(/^\[[^\]]+\]\s*/, ''); // 대괄호 부분을 타이틀에서 제거
      }

      let thumbnail = $('meta[property="og:image"]').attr('content');

      let price = $(".market-info-view-table").find('td').eq(2).text().trim();

      let currency = 'KRW';

      if (price.includes('USD') || price.includes('$')) {
        currency = 'USD';
      }

       // price에서 숫자만 추출 (콤마, 소수점 포함)
      const priceNumber = price.replace(/[^\d.,]/g, '').replace(',', '');
      const cleanPrice = parseFloat(priceNumber) || 0;

      let shippingType = $(".market-info-view-table").find('td').eq(3).text().trim();

      let freeShipping = 'N';
      if (shippingType.includes('무료')) {
        freeShipping = 'Y';
      }

      let categoryTitle = $(".ca_name").text().trim();

      let productLink = $(".market-info-view-table").find('td').eq(0).text().trim();

      let siteLink = `https://quasarzone.com/bbs/qb_saleinfo/views/${productId}`;
      

      let detailData = {
        channel: 2,
        label: label,
        title: title,
        seller: seller,
        thumbnail: thumbnail,
        price: cleanPrice,
        currency: currency,
        freeShipping: freeShipping,
        categoryTitle: categoryTitle,
        productLink: productLink,
        siteLink: siteLink,
      }
      return detailData;
    } catch (error) {
      console.error(`${this.getCrawlerName()} 상품 상세정보 수집 오류:`, error);
      return null;
    }
  }

  /**
   * 크롤러 이름 반환
   * @returns {string} 크롤러 이름
   */
  static getCrawlerName() {
    return 'ppomppu';
  }

  /**
   * 지원하는 카테고리 목록 반환
   * @returns {Array<string>} 지원하는 카테고리 배열
   */
  static getSupportedCategories() {
    return ['ppomppu', 'freeboard'];
  }

  /**
   * 상품 제목을 정리하는 내부 메서드
   * @param {string} title - 원본 제목
   * @returns {string} 정리된 제목
   * @private
   */
  static _cleanTitle(title) {
    return title
      .replace(/\)\s*\d{1,2}\s*$/, ')') // 마지막 ) 다음에 숫자 1-2개 제거 (괄호 내용은 유지)
      .trim();
  }

  // 하위 호환성을 위한 기존 메서드 유지 (Deprecated)
  /** @deprecated getProducts 사용을 권장합니다 */
  static async getList(id) {
    console.warn('getList는 deprecated 메서드입니다. getProducts를 사용해주세요.');
    return this.getProducts(id);
  }

  /** @deprecated getProductDetail 사용을 권장합니다 */
  static async getDetail(id, idx) {
    console.warn('getDetail은 deprecated 메서드입니다. getProductDetail을 사용해주세요.');
    return this.getProductDetail(id, idx);
  }
}

module.exports = Quasarzone;