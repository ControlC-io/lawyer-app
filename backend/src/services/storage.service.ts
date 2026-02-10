import * as Minio from 'minio';
import { Readable } from 'stream';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const bucketName = process.env.MINIO_BUCKET_NAME || 'floowly';
const documentsBucket = 'documents';

export const storageService = {
  async init() {
    try {
      // Create main bucket
      const exists = await minioClient.bucketExists(bucketName);
      if (!exists) {
        await minioClient.makeBucket(bucketName, 'us-east-1');
        console.log(`Bucket "${bucketName}" created.`);
      }

      // Create documents bucket (for file uploads)
      const docsExists = await minioClient.bucketExists(documentsBucket);
      if (!docsExists) {
        await minioClient.makeBucket(documentsBucket, 'us-east-1');
        console.log(`Bucket "${documentsBucket}" created.`);
      }
    } catch (error) {
      console.error('Error initializing MinIO buckets:', error);
      throw error;
    }
  },

  /**
   * Upload a file to MinIO
   * @param bucket Bucket name
   * @param path File path within bucket
   * @param file File buffer or stream
   * @param contentType MIME type
   * @returns Upload info
   */
  async uploadFile(
    bucket: string,
    path: string,
    file: Buffer | Readable,
    contentType?: string
  ): Promise<{ etag: string; path: string }> {
    try {
      const metadata: Record<string, string> = {};
      if (contentType) {
        metadata['Content-Type'] = contentType;
      }

      const result = await minioClient.putObject(
        bucket,
        path,
        file,
        file instanceof Buffer ? file.length : undefined,
        metadata
      );

      return {
        etag: result.etag,
        path,
      };
    } catch (error) {
      console.error('Error uploading file to MinIO:', error);
      throw new Error(`Failed to upload file: ${(error as Error).message}`);
    }
  },

  /**
   * Download a file from MinIO
   * @param bucket Bucket name
   * @param path File path
   * @returns File stream
   */
  async downloadFile(bucket: string, path: string): Promise<Readable> {
    try {
      const stream = await minioClient.getObject(bucket, path);
      return stream;
    } catch (error) {
      console.error('Error downloading file from MinIO:', error);
      throw new Error(`Failed to download file: ${(error as Error).message}`);
    }
  },

  /**
   * Generate a presigned URL for file access
   * @param bucket Bucket name
   * @param path File path
   * @param expiresIn Expiration time in seconds (default: 1 year)
   * @returns Signed URL
   */
  async getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 31536000 // 1 year default
  ): Promise<string> {
    try {
      const url = await minioClient.presignedGetObject(bucket, path, expiresIn);
      return url;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error(`Failed to generate signed URL: ${(error as Error).message}`);
    }
  },

  /**
   * Delete a file from MinIO
   * @param bucket Bucket name
   * @param path File path
   */
  async deleteFile(bucket: string, path: string): Promise<void> {
    try {
      await minioClient.removeObject(bucket, path);
    } catch (error) {
      console.error('Error deleting file from MinIO:', error);
      throw new Error(`Failed to delete file: ${(error as Error).message}`);
    }
  },

  /**
   * List files in a bucket with optional prefix filter
   * @param bucket Bucket name
   * @param prefix Path prefix filter
   * @returns Array of file objects
   */
  async listFiles(
    bucket: string,
    prefix?: string
  ): Promise<Array<{ name: string; size: number; lastModified: Date }>> {
    try {
      const files: Array<{ name: string; size: number; lastModified: Date }> = [];
      const stream = minioClient.listObjects(bucket, prefix, true);

      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => {
          if (obj.name) {
            files.push({
              name: obj.name,
              size: obj.size || 0,
              lastModified: obj.lastModified || new Date(),
            });
          }
        });

        stream.on('end', () => resolve(files));
        stream.on('error', (err) => reject(err));
      });
    } catch (error) {
      console.error('Error listing files from MinIO:', error);
      throw new Error(`Failed to list files: ${(error as Error).message}`);
    }
  },

  /**
   * Check if a file exists
   * @param bucket Bucket name
   * @param path File path
   * @returns True if file exists
   */
  async fileExists(bucket: string, path: string): Promise<boolean> {
    try {
      await minioClient.statObject(bucket, path);
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get file metadata
   * @param bucket Bucket name
   * @param path File path
   * @returns File metadata
   */
  async getFileStat(bucket: string, path: string): Promise<{
    size: number;
    lastModified: Date;
    etag: string;
    contentType?: string;
  }> {
    try {
      const stat = await minioClient.statObject(bucket, path);
      return {
        size: stat.size,
        lastModified: stat.lastModified,
        etag: stat.etag,
        contentType: stat.metaData?.['content-type'],
      };
    } catch (error) {
      console.error('Error getting file stat from MinIO:', error);
      throw new Error(`Failed to get file stat: ${(error as Error).message}`);
    }
  },

  getClient() {
    return minioClient;
  },

  getBucketName() {
    return bucketName;
  },

  getDocumentsBucket() {
    return documentsBucket;
  },
};
