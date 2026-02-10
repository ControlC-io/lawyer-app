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
    it('should return a signed URL', async () => {
      const response = await request(app)
        .post('/api/files/signed-url')
        .set(mockAuthHeaders)
        .send({ bucket: 'documents', path: 'some/path.png' });

      expect(response.status).toBe(200);
      expect(response.body.signedUrl).toBe('http://signed-url.com');
    });

  });

  describe('POST /api/files/workflows/executions/:executionId/steps/:stepId/process-file', () => {
    it('should process file step successfully', async () => {
      (prisma.workflowStep.findUnique as jest.Mock).mockResolvedValue({
        config: { source_file_id: 'f1', target_folder_id: 'folder-1' }
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
