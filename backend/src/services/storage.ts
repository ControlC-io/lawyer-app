import * as Minio from 'minio';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const bucketName = process.env.MINIO_BUCKET_NAME || 'floowly';

export const storageService = {
  async init() {
    try {
      const exists = await minioClient.bucketExists(bucketName);
      if (!exists) {
        await minioClient.makeBucket(bucketName, 'eu-west-1');
        console.log(`Bucket "${bucketName}" created.`);
      } else {
        console.log(`Bucket "${bucketName}" already exists.`);
      }
    } catch (error) {
      console.error('Error initializing MinIO bucket:', error);
      throw error;
    }
  },
  
  getClient() {
    return minioClient;
  }
  // Add methods for upload, download, delete...
};
