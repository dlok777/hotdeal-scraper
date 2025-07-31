const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
const path = require('path');

/**
 * AWS S3 이미지 업로드 유틸리티 클래스
 * 이미지를 다운로드하여 S3에 업로드하는 기능을 제공합니다.
 */
class S3Uploader {
  /**
   * S3Uploader 생성자
   * @param {Object} config - AWS 설정 객체
   * @param {string} config.accessKeyId - AWS Access Key ID
   * @param {string} config.secretAccessKey - AWS Secret Access Key
   * @param {string} config.region - AWS 리전 (기본값: 'ap-northeast-2')
   * @param {string} config.bucket - S3 버킷 이름
   */
  constructor(config) {
    this.config = {
      region: config.region || 'ap-northeast-2',
      bucket: config.bucket,
      ...config
    };

    this.s3Client = new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey
      }
    });
  }

  /**
   * 이미지 URL에서 이미지를 다운로드하여 S3에 업로드
   * @param {string} imageUrl - 업로드할 이미지 URL
   * @param {string} folder - S3 내 폴더 경로 (기본값: 'images')
   * @returns {Promise<string|null>} 업로드된 S3 URL, 실패시 null
   */
  async uploadImageFromUrl(imageUrl, folder = 'images') {
    try {
      // URL 유효성 검사 및 정규화
      if (!imageUrl || imageUrl.trim() === '') {
        console.warn('S3Uploader: 유효하지 않은 이미지 URL입니다.');
        return null;
      }

      const normalizedUrl = this._normalizeUrl(imageUrl);
      
      // 이미지 다운로드
      const imageBuffer = await this._downloadImage(normalizedUrl);
      if (!imageBuffer) {
        return null;
      }

      // S3에 업로드
      const s3Url = await this._uploadToS3(imageBuffer, normalizedUrl, folder);
      return s3Url;

    } catch (error) {
      console.error('S3Uploader: 이미지 업로드 실패:', error.message);
      return null;
    }
  }

  /**
   * URL을 정규화 (프로토콜 추가 등)
   * @param {string} url - 원본 URL
   * @returns {string} 정규화된 URL
   * @private
   */
  _normalizeUrl(url) {
    if (url.startsWith('//')) {
      return 'https:' + url;
    } else if (!url.startsWith('http')) {
      return 'https://' + url;
    }
    return url;
  }

  /**
   * 이미지를 다운로드하여 버퍼로 반환
   * @param {string} url - 이미지 URL
   * @returns {Promise<Buffer|null>} 이미지 버퍼, 실패시 null
   * @private
   */
  async _downloadImage(url) {
    try {
      const response = await axios({
        url: url,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 10000, // 10초 타임아웃
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      return Buffer.from(response.data);
    } catch (error) {
      console.error(`S3Uploader: 이미지 다운로드 실패 (${url}):`, error.message);
      return null;
    }
  }

  /**
   * 이미지를 S3에 업로드
   * @param {Buffer} imageBuffer - 이미지 버퍼
   * @param {string} originalUrl - 원본 이미지 URL
   * @param {string} folder - S3 폴더 경로
   * @returns {Promise<string>} S3 URL
   * @private
   */
  async _uploadToS3(imageBuffer, originalUrl, folder) {
    // 파일명 생성
    const fileName = this._generateFileName(originalUrl);
    const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM 형식
    const s3Key = `${folder}/${yearMonth}/${fileName}`;

    // S3 업로드 파라미터
    const uploadParams = {
      Bucket: this.config.bucket,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: this._getContentType(originalUrl),
      ACL: 'public-read'
    };

    // S3에 업로드
    await this.s3Client.send(new PutObjectCommand(uploadParams));

    // 업로드된 파일의 URL 생성
    const s3Url = `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${s3Key}`;
    return s3Url;
  }

  /**
   * 고유한 파일명 생성
   * @param {string} originalUrl - 원본 URL
   * @returns {string} 생성된 파일명
   * @private
   */
  _generateFileName(originalUrl) {
    // 원본 파일명에서 쿼리스트링 제거
    let originalName = path.basename(originalUrl).split('?')[0];
    
    // 파일 확장자 확인 및 추가
    if (!originalName.includes('.')) {
      originalName += '.jpg';
    }

    // 랜덤값과 타임스탬프로 고유 파일명 생성
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const extension = path.extname(originalName);
    const nameWithoutExt = path.basename(originalName, extension);

    return `${timestamp}_${random}_${nameWithoutExt}${extension}`;
  }

  /**
   * 파일 확장자에 따른 Content-Type 반환
   * @param {string} url - 파일 URL
   * @returns {string} Content-Type
   * @private
   */
  _getContentType(url) {
    const extension = path.extname(url).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[extension] || 'image/jpeg';
  }

  /**
   * 설정 정보 반환
   * @returns {Object} 설정 객체 (민감한 정보 제외)
   */
  getConfig() {
    return {
      region: this.config.region,
      bucket: this.config.bucket
    };
  }
}

module.exports = S3Uploader;