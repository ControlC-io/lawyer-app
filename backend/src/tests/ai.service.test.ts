import { aiService } from '../services/ai.service';
import fetch from 'node-fetch';

jest.mock('node-fetch');
const { Response } = jest.requireActual('node-fetch');

describe('ai.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('callAgentEndpoint', () => {
    it('should return success and data on 200 JSON response', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ result: 'ok' }), { status: 200 })
      );
      const result = await aiService.callAgentEndpoint(
        'http://agent.local/run',
        'POST',
        {},
        { key: 'value' }
      );
      expect(result).toEqual({ success: true, data: { result: 'ok' } });
    });

    it('should return success: false with error and details on non-ok response', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response('Server error', { status: 500 })
      );
      const result = await aiService.callAgentEndpoint(
        'http://agent.local/run',
        'POST',
        {},
        {}
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent API error');
      expect(result.details).toBe('Server error');
    });

    it('should use body undefined for GET', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ data: 1 }), { status: 200 })
      );
      await aiService.callAgentEndpoint(
        'http://agent.local/run',
        'GET',
        {},
        { foo: 'bar' }
      );
      expect(fetch).toHaveBeenCalledWith(
        'http://agent.local/run',
        expect.objectContaining({
          method: 'GET',
          body: undefined,
        })
      );
    });

    it('should use JSON body for POST', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );
      await aiService.callAgentEndpoint(
        'http://agent.local/run',
        'POST',
        {},
        { a: 1 }
      );
      expect(fetch).toHaveBeenCalledWith(
        'http://agent.local/run',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ a: 1 }),
        })
      );
    });

    it('should return success: false when fetch throws', async () => {
      (fetch as unknown as jest.Mock).mockRejectedValue(new Error('Network error'));
      const result = await aiService.callAgentEndpoint(
        'http://agent.local/run',
        'POST',
        {},
        {}
      );
      expect(result).toEqual({
        success: false,
        error: 'Network error',
      });
    });
  });

  describe('transcribeAudio', () => {
    it('should return text and language on success', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response(
          JSON.stringify({ text: 'Hello world', language: 'en' }),
          { status: 200 }
        )
      );
      const result = await aiService.transcribeAudio(
        'http://audio.url/file',
        'http://api.transcribe/run'
      );
      expect(result).toEqual({ text: 'Hello world', language: 'en' });
    });

    it('should use transcription key as fallback for text', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response(
          JSON.stringify({ transcription: 'Fallback text' }),
          { status: 200 }
        )
      );
      const result = await aiService.transcribeAudio('url', 'api');
      expect(result.text).toBe('Fallback text');
    });

    it('should throw when response is not ok', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response('Bad Request', { status: 400 })
      );
      await expect(
        aiService.transcribeAudio('url', 'api')
      ).rejects.toThrow('Failed to transcribe audio');
    });

    it('should set Authorization header when apiKey provided', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ text: '' }), { status: 200 })
      );
      await aiService.transcribeAudio('url', 'api', 'secret-key');
      expect(fetch).toHaveBeenCalledWith(
        'api',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-key',
          }),
        })
      );
    });
  });

  describe('validateFormWithAI', () => {
    it('should return isValid, errors, suggestions on success', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response(
          JSON.stringify({
            is_valid: true,
            errors: ['e1'],
            suggestions: ['s1'],
          }),
          { status: 200 }
        )
      );
      const result = await aiService.validateFormWithAI(
        { name: 'Test' },
        'rules',
        'http://api/validate'
      );
      expect(result).toEqual({
        isValid: true,
        errors: ['e1'],
        suggestions: ['s1'],
      });
    });

    it('should use valid key as fallback for isValid', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ valid: true }), { status: 200 })
      );
      const result = await aiService.validateFormWithAI({}, '', 'api');
      expect(result.isValid).toBe(true);
    });

    it('should throw when response is not ok', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response('Error', { status: 500 })
      );
      await expect(
        aiService.validateFormWithAI({}, 'rules', 'api')
      ).rejects.toThrow('Failed to validate form with AI');
    });
  });

  describe('createWorkflowWithAI', () => {
    it('should return workflow, steps, connections on success', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response(
          JSON.stringify({
            workflow: { name: 'W' },
            steps: [{ id: '1' }],
            connections: [],
          }),
          { status: 200 }
        )
      );
      const result = await aiService.createWorkflowWithAI(
        'desc',
        'reqs',
        'http://api/create'
      );
      expect(result).toEqual({
        workflow: { name: 'W' },
        steps: [{ id: '1' }],
        connections: [],
      });
    });

    it('should throw when response is not ok', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(
        new Response('Error', { status: 400 })
      );
      await expect(
        aiService.createWorkflowWithAI('d', 'r', 'api')
      ).rejects.toThrow('Failed to create workflow with AI');
    });
  });
});
