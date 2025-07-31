// 뉴사이트 크롤러 예시
class NewSiteCrawler extends BaseCrawler {
  static async getProducts(category) {
    // 구현
  }
  static async getProductDetail(category, productId) {
    // 구현  
  }
  static getCrawlerName() { return 'newsite'; }
  static getSupportedCategories() { return ['category1']; }
}