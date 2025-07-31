/**
 * 모든 크롤러가 상속받을 기본 추상 클래스
 * 모든 크롤러는 동일한 인터페이스를 제공해야 합니다.
 */
class BaseCrawler {
  /**
   * 상품 목록을 가져오는 추상 메서드
   * @param {string} category - 카테고리 식별자
   * @returns {Promise<Array>} 상품 목록 배열
   */
  static async getProducts(category) {
    throw new Error('getProducts 메서드는 반드시 구현해야 합니다.');
  }

  /**
   * 상품 상세 정보를 가져오는 추상 메서드
   * @param {string} category - 카테고리 식별자
   * @param {string} productId - 상품 ID
   * @returns {Promise<Object>} 상품 상세 정보 객체
   */
  static async getProductDetail(category, productId) {
    throw new Error('getProductDetail 메서드는 반드시 구현해야 합니다.');
  }

  /**
   * 크롤러 이름을 반환하는 추상 메서드
   * @returns {string} 크롤러 이름
   */
  static getCrawlerName() {
    throw new Error('getCrawlerName 메서드는 반드시 구현해야 합니다.');
  }

  /**
   * 지원하는 카테고리 목록을 반환하는 추상 메서드
   * @returns {Array<string>} 지원하는 카테고리 배열
   */
  static getSupportedCategories() {
    throw new Error('getSupportedCategories 메서드는 반드시 구현해야 합니다.');
  }

  /**
   * 표준 상품 객체 형태로 데이터를 정규화
   * @param {Object} rawData - 원본 데이터
   * @returns {Object} 정규화된 상품 객체
   */
  static normalizeProduct(rawData) {
    return {
      id: rawData.id || null,
      title: rawData.title || '',
      category: rawData.category || '',
      seller: rawData.seller || '',
      price: rawData.price || 0,
      freeShipping: rawData.freeShipping || 'N',
      thumbnail: rawData.thumbnail || '',
      productLink: rawData.productLink || '',
      crawlerName: this.getCrawlerName(),
      createdAt: new Date()
    };
  }
}

module.exports = BaseCrawler;