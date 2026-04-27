const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');

class S3Uploader {
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
   * 이미지 URL을 다운로드 → 로컬 임시 파일 저장 → S3 업로드 → 임시 파일 삭제
   * @param {string} imageUrl
   * @param {string} folder
   * @param {Object} downloadHeaders - 다운로드 요청에 추가할 HTTP 헤더 (Referer 등)
   * @returns {Promise<string|null>}
   */
  async uploadImageFromUrl(imageUrl, folder = 'images', downloadHeaders = {}) {
    if (!imageUrl || imageUrl.trim() === '') return null;

    const normalizedUrl = this._normalizeUrl(imageUrl);
    let tempPath = null;

    try {
      const { filePath, contentType } = await this._downloadImageToFile(normalizedUrl, downloadHeaders);
      tempPath = filePath;

      const imageBuffer = fs.readFileSync(tempPath);
      const s3Url = await this._uploadToS3(imageBuffer, normalizedUrl, folder, contentType);
      return s3Url;
    } catch (error) {
      console.error('S3Uploader: 이미지 업로드 실패:', error.message);
      return null;
    } finally {
      if (tempPath && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
    }
  }

  /**
   * 이미 다운로드된 Buffer를 S3에 직접 업로드
   * @param {Buffer} buffer
   * @param {string} originalUrl - 파일명 생성에 사용
   * @param {string} folder
   * @param {string} contentType
   * @returns {Promise<string|null>}
   */
  async uploadImageFromBuffer(buffer, originalUrl, folder = 'images', contentType = 'image/jpeg') {
    try {
      return await this._uploadToS3(buffer, originalUrl, folder, contentType);
    } catch (error) {
      console.error('S3Uploader: 버퍼 업로드 실패:', error.message);
      return null;
    }
  }

  _normalizeUrl(url) {
    if (url.startsWith('//')) return 'https:' + url;
    if (!url.startsWith('http')) return 'https://' + url;
    return url;
  }

  /**
   * 이미지를 다운로드해 임시 파일로 저장 후 경로와 content-type 반환
   * @private
   */
  async _downloadImageToFile(url, extraHeaders = {}) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        ...extraHeaders,
      },
    });

    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`이미지 아닌 응답 (${contentType})`);
    }

    const ext = path.extname(url.split('?')[0]) || '.jpg';
    const tempPath = path.join(
      os.tmpdir(),
      `hotdeal_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
    );

    fs.writeFileSync(tempPath, Buffer.from(response.data));
    console.log(`S3Uploader: 임시 파일 저장 완료 (${response.data.byteLength}B) → ${tempPath}`);

    return { filePath: tempPath, contentType };
  }

  async _uploadToS3(imageBuffer, originalUrl, folder, contentType) {
    const fileName = this._generateFileName(originalUrl);
    const date = new Date().toISOString().slice(0, 10);
    const s3Key = `${folder}/${date}/${fileName}`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: contentType || this._getContentType(originalUrl),
      ACL: 'public-read'
    }));

    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${s3Key}`;
  }

  _generateFileName(originalUrl) {
    // 쿼리스트링 제거 후 파일명 추출
    let originalName = path.basename(originalUrl).split('?')[0];
    if (!originalName.includes('.')) originalName += '.jpg';

    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const extension = path.extname(originalName);
    const nameWithoutExt = path.basename(originalName, extension);

    return `${timestamp}_${random}_${nameWithoutExt}${extension}`;
  }

  _getContentType(url) {
    const ext = path.extname(url.split('?')[0]).toLowerCase();
    return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
             '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'image/jpeg';
  }

  getConfig() {
    return { region: this.config.region, bucket: this.config.bucket };
  }
}

module.exports = S3Uploader;
