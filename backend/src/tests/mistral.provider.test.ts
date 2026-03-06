import { MistralOcrProvider } from '../services/ocr/mistral.provider';

// Mock node-fetch — use jest.fn() inside the factory to avoid hoisting issues
const mockFetch = jest.fn();
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: (...args: any[]) => mockFetch(...args),
}));

describe('MistralOcrProvider', () => {
  let provider: MistralOcrProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OCR_API_KEY = 'test-api-key';
    process.env.OCR_MODEL = 'mistral-ocr-latest';
    process.env.OCR_API_URL = 'https://api.mistral.ai/v1/ocr';
    provider = new MistralOcrProvider();
  });

  afterEach(() => {
    delete process.env.OCR_API_KEY;
    delete process.env.OCR_MODEL;
    delete process.env.OCR_API_URL;
  });

  it('should throw if OCR_API_KEY is not set', async () => {
    delete process.env.OCR_API_KEY;
    const p = new MistralOcrProvider();
    await expect(p.process(Buffer.from('test'), 'application/pdf', 'test.pdf'))
      .rejects.toThrow('OCR API key not configured');
  });

  it('should process a PDF and return concatenated markdown', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        pages: [
          { index: 0, markdown: '# Page 1\nContent of page 1' },
          { index: 1, markdown: '# Page 2\nContent of page 2' },
        ],
      }),
    });

    const result = await provider.process(
      Buffer.from('fake-pdf-content'),
      'application/pdf',
      'test.pdf'
    );

    expect(result.markdown).toBe('# Page 1\nContent of page 1\n\n---\n\n# Page 2\nContent of page 2');
    expect(result.pagesProcessed).toBe(2);
    expect(result.provider).toBe('mistral');
    expect(result.model).toBe('mistral-ocr-latest');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/ocr');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-api-key');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('mistral-ocr-latest');
    expect(body.document.type).toBe('document_url');
    expect(body.document.document_url).toMatch(/^data:application\/pdf;base64,/);
    expect(body.include_image_base64).toBe(false);
  });

  it('should handle single-page response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        pages: [{ index: 0, markdown: 'Single page content' }],
      }),
    });

    const result = await provider.process(Buffer.from('data'), 'image/png', 'photo.png');
    expect(result.markdown).toBe('Single page content');
    expect(result.pagesProcessed).toBe(1);
  });

  it('should throw on 401 auth error without retrying', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key',
    });

    await expect(provider.process(Buffer.from('data'), 'application/pdf', 'test.pdf'))
      .rejects.toThrow('OCR authentication failed. Check OCR_API_KEY.');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should retry on 429 with exponential backoff then fail', async () => {
    const errorResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limited',
    };
    mockFetch
      .mockResolvedValueOnce(errorResponse)
      .mockResolvedValueOnce(errorResponse)
      .mockResolvedValueOnce(errorResponse);

    await expect(provider.process(Buffer.from('data'), 'application/pdf', 'test.pdf'))
      .rejects.toThrow(/OCR request failed after 3 retries/);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 30000);

  it('should retry on 5xx and succeed on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          pages: [{ index: 0, markdown: 'Recovered content' }],
        }),
      });

    const result = await provider.process(Buffer.from('data'), 'application/pdf', 'test.pdf');
    expect(result.markdown).toBe('Recovered content');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 15000);
});
