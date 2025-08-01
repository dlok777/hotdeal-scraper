const fetch = require('node-fetch');
const cheerio = require("cheerio");
const iconv = require('iconv-lite');
const BaseCrawler = require('./BaseCrawler');
const fs = require('fs');

/**
 * 뽐뿌 사이트 크롤러 클래스
 * BaseCrawler를 상속받아 뽐뿌 사이트의 핫딜 정보를 수집합니다.
 */
class Ppomppu extends BaseCrawler {
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
  static async getProductDetail(category, productId) {
    try {
      const url = `https://www.ppomppu.co.kr/zboard/view.php?id=${category}&no=${productId}`;

      // 상세 페이지 HTML 가져오기
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      const html = iconv.decode(Buffer.from(buffer), 'euc-kr');
      const $ = cheerio.load(html);

      // 상세 정보 파싱
      const categoryTitle = $("#topTitle .subject_preface").text().trim();
      const comment = $("#comment").text().trim();
      let title = $("#topTitle h1").text().trim()
        .replace(categoryTitle, "").trim()
      
      const productLink = $(".topTitle-link a").attr('href') || $(".topTitle-link a").text().trim();
      
                    // 가격 정보 추출 (다양한 가격 형태 지원)
       let priceMatch = title.match(/(\d{1,3}(?:,\d{3})*)\s*원/) || // 35,750원, 9,000 원
                        title.match(/(\d+)만원/) || // 24만원
                        title.match(/\((\d{1,3}(?:,\d{3})*)[\/,)]/); // (35,750/) 또는 (35,750,) 또는 (35,750)
       
       let price = 0;
       if (priceMatch) {
         let priceStr = priceMatch[1].replace(/,/g, '');
         
          // 만원 단위 처리
         if (title.includes('만원')) {
            price = parseInt(priceStr) * 10000;
         } else {
            // 39,00 같은 경우 39,000으로 해석 (00으로 끝나는 경우) - 하지만 이미 완전한 가격인 경우는 제외
           if (priceStr.endsWith('00') && priceStr.length == 3) {
             priceStr = priceStr.slice(0, -2) + '000';
           }
           price = parseInt(priceStr);
         }
       }
      
      
      // 무료배송 여부 판단
      const freeShipping = (title.includes("무료") || title.includes("무배") || title.includes("와우")) ? 'Y' : 'N';

      let siteLink = `https://www.ppomppu.co.kr/zboard/view.php?id=${category}&no=${productId}`;
      
      let thumbnail = $(".board-contents").find('img').attr('src');
      
      
      // 제목에서 가격 정보 제거
      title = this._cleanTitle(title);
      

      const detailData = {
        // category: categoryTitle,
        title: title,
        comment: comment,
        productLink: productLink,
        price: price,
        freeShipping: freeShipping,
        siteLink: siteLink,
        thumbnail: thumbnail
      };
      
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

module.exports = Ppomppu;