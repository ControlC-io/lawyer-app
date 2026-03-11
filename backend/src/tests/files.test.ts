import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import fetch from 'node-fetch';

// Mock Prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    workflowExecution: { findFirst: jest.fn(), findUnique: jest.fn() },
    workflowExecutionData: { findFirst: jest.fn(), update: jest.fn() },
    workflowExecutionStep: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    workflowStep: { findUnique: jest.fn() },
    file: { create: jest.fn() },
    filesMetadataKey: { findMany: jest.fn() },
    filesMetadataValue: { createMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

// Mock Storage Service
const mockUploadFile = jest.fn().mockImplementation(() => Promise.resolve({ etag: 'test-etag', path: 'test-path' }));
const mockGetSignedUrl = jest.fn().mockImplementation(() => Promise.resolve('http://signed-url.com'));
const mockGetFileStat = jest.fn().mockImplementation(() => Promise.resolve({ contentType: 'image/png' }));
const mockDownloadFile = jest.fn();

jest.mock('../services/storage.service', () => ({
  storageService: {
    uploadFile: (...args: any[]) => mockUploadFile(...args),
    downloadFile: (...args: any[]) => mockDownloadFile(...args),
    getSignedUrl: (...args: any[]) => mockGetSignedUrl(...args),
    getDocumentsBucket: () => 'documents',
    getFileStat: (...args: any[]) => mockGetFileStat(...args),
  }
}));

// Mock Workflow Service
jest.mock('../services/workflow.service', () => ({
  workflowService: {
    advanceWorkflow: jest.fn().mockResolvedValue([]),
  }
}));

// Mock node-fetch
jest.mock('node-fetch');
const { Response } = jest.requireActual('node-fetch');

describe('Files Endpoints', () => {
  const mockCompany = { id: 'company-123', api_key: 'test-key', is_active: true };
  const mockAuthHeaders = { 'x-api-key': 'test-key' };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
    mockUploadFile.mockResolvedValue({ etag: 'test-etag', path: 'test-path' });
    mockGetSignedUrl.mockResolvedValue('http://signed-url.com');
    mockGetFileStat.mockResolvedValue({ contentType: 'image/png' });
  });

  describe('POST /api/files/workflows/executions/:executionId/files', () => {
    it('should upload a file via base64 successfully', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [{ id: 'f1', name: 'FileField', field_type: 'file' }]
        }
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({ id: 'data-123', values: {} });

      const response = await request(app)
        .post('/api/files/workflows/executions/exec-123/files')
        .set(mockAuthHeaders)
        .send({
          field_name: 'FileField',
          file_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          file_name: 'test.png'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockUploadFile).toHaveBeenCalled();
      expect(prisma.workflowExecutionData.update).toHaveBeenCalled();
    });

    it('should return 401 when x-api-key is missing', async () => {
      const response = await request(app)
        .post('/api/files/workflows/executions/exec-123/files')
        .send({
          field_name: 'FileField',
          file_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          file_name: 'test.png'
        });
      expect(response.status).toBe(401);
    });

    it('should return 400 when neither file_url nor file_base64 provided', async () => {
      const response = await request(app)
        .post('/api/files/workflows/executions/exec-123/files')
        .set(mockAuthHeaders)
        .send({ field_name: 'FileField', file_name: 'test.png' });
      expect(response.status).toBe(400);
      expect(response.body.details).toMatch(/file_url|file_base64/i);
    });

    it('should return 400 when both file_url and file_base64 provided', async () => {
      const response = await request(app)
        .post('/api/files/workflows/executions/exec-123/files')
        .set(mockAuthHeaders)
        .send({
          field_name: 'FileField',
          file_url: 'http://example.com/f',
          file_base64: 'data:image/png;base64,abc',
          file_name: 'test.png',
        });
      expect(response.status).toBe(400);
      expect(response.body.details).toMatch(/both|Cannot/i);
    });

    it('should upload a file to an array sub-field (append new item)', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [
            { id: 'arr1', name: 'documents', field_type: 'array' },
            { id: 'file1', name: 'attachment', field_type: 'file', parent_item_id: 'arr1' },
          ]
        }
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: { arr1: { value: [] } }
      });

      const response = await request(app)
        .post('/api/files/workflows/executions/exec-123/files')
        .set(mockAuthHeaders)
        .send({
          field_name: 'documents',
          sub_field_name: 'attachment',
          file_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          file_name: 'test.png'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.sub_field_name).toBe('attachment');
      expect(response.body.index).toBe(0);
      expect(mockUploadFile).toHaveBeenCalled();

      const updateCall = (prisma.workflowExecutionData.update as jest.Mock).mock.calls[0][0];
      const updatedArr = updateCall.data.values.arr1.value;
      expect(updatedArr).toHaveLength(1);
      expect(updatedArr[0]._id).toBeDefined();
      expect(updatedArr[0].file1.value).toContain('executions/');
      expect(updatedArr[0].file1.original_name).toBe('test.png');
    });

    it('should upload a file to an array sub-field at a specific index', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [
            { id: 'arr1', name: 'documents', field_type: 'array' },
            { id: 'file1', name: 'attachment', field_type: 'file', parent_item_id: 'arr1' },
          ]
        }
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: {
          arr1: {
            value: [
              { _id: 'item-1', file1: null },
              { _id: 'item-2', file1: null },
            ]
          }
        }
      });

      const response = await request(app)
        .post('/api/files/workflows/executions/exec-123/files')
        .set(mockAuthHeaders)
        .send({
          field_name: 'documents',
          sub_field_name: 'attachment',
          index: 1,
          file_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          file_name: 'doc.png'
        });

      expect(response.status).toBe(200);
      expect(response.body.index).toBe(1);

      const updateCall = (prisma.workflowExecutionData.update as jest.Mock).mock.calls[0][0];
      const updatedArr = updateCall.data.values.arr1.value;
      expect(updatedArr).toHaveLength(2);
      expect(updatedArr[1].file1.value).toContain('executions/');
      expect(updatedArr[1].file1.original_name).toBe('doc.png');
      expect(updatedArr[0].file1).toBeNull();
    });

    it('should return 400 when sub_field_name targets a non-array field', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [
            { id: 'f1', name: 'avatar', field_type: 'file' },
          ]
        }
      });

      const response = await request(app)
        .post('/api/files/workflows/executions/exec-123/files')
        .set(mockAuthHeaders)
        .send({
          field_name: 'avatar',
          sub_field_name: 'attachment',
          file_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 when index is out of range for array sub-field', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [
            { id: 'arr1', name: 'documents', field_type: 'array' },
            { id: 'file1', name: 'attachment', field_type: 'file', parent_item_id: 'arr1' },
          ]
        }
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: { arr1: { value: [{ _id: 'item-1' }] } }
      });

      const response = await request(app)
        .post('/api/files/workflows/executions/exec-123/files')
        .set(mockAuthHeaders)
        .send({
          field_name: 'documents',
          sub_field_name: 'attachment',
          index: 5,
          file_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        });

      expect(response.status).toBe(400);
    });

    it('should return 404 when execution is not found', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/files/workflows/executions/exec-123/files')
        .set(mockAuthHeaders)
        .send({
          field_name: 'FileField',
          file_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          file_name: 'test.png'
        });
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/files/signed-url', () => {
    it('should return a proxy URL for documents bucket', async () => {
      const response = await request(app)
        .post('/api/files/signed-url')
        .set(mockAuthHeaders)
        .send({ bucket: 'documents', path: 'some/path.png' });

      expect(response.status).toBe(200);
      expect(response.body.signedUrl).toMatch(/^https?:\/\//);
      expect(response.body.signedUrl).toContain('/api/files/document');
      expect(response.body.signedUrl).toContain('token=');
    });

    it('should return MinIO signed URL for non-documents bucket', async () => {
      mockGetSignedUrl.mockResolvedValue('http://signed-url.com');
      const response = await request(app)
        .post('/api/files/signed-url')
        .set(mockAuthHeaders)
        .send({ bucket: 'floowly', path: 'some/path.png' });

      expect(response.status).toBe(200);
      expect(response.body.signedUrl).toBe('http://signed-url.com');
    });
  });

  describe('POST /api/files/workflows/executions/:executionId/steps/:stepId/process-file', () => {
    it('should process file step successfully', async () => {
      (prisma.workflowStep.findUnique as jest.Mock).mockResolvedValue({
        config: { source_file_id: 'f1' }
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        values: { f1: { value: 'old/path.png' } }
      });
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({ company_id: 'company-123' });
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({ assigned_to_user_id: 'user-1' });
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue({ step_id: 'step-1', company_id: 'company-123' });
      
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('test data');
        }
      };
      mockDownloadFile.mockResolvedValue(mockStream);
      (prisma.file.create as jest.Mock).mockResolvedValue({ id: 'new-file-123' });

      const response = await request(app)
        .post('/api/files/workflows/executions/exec-123/steps/step-123/process-file')
        .set(mockAuthHeaders)
        .send({ workflow_step_id: 'wf-step-1' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
