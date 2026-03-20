import fetch from 'node-fetch';

export const aiService = {
  /**
   * Transcribe audio using external transcription service
   * @param audioUrl URL to audio file
   * @param apiUrl Transcription API URL
   * @param apiKey API key for transcription service
   */
  async transcribeAudio(
    audioUrl: string,
    apiUrl: string,
    apiKey?: string
  ): Promise<{ text: string; language?: string }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ audio_url: audioUrl }),
      });

      if (!response.ok) {
        throw new Error(`Transcription API error: ${response.statusText}`);
      }

      const result: any = await response.json();
      return {
        text: result.text || result.transcription || '',
        language: result.language,
      };
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw new Error('Failed to transcribe audio');
    }
  },

  /**
   * Validate form data using AI
   * @param formData Form data to validate
   * @param validationRules Validation rules
   * @param apiUrl AI validation API URL
   * @param apiKey API key for AI service
   */
  async validateFormWithAI(
    formData: Record<string, any>,
    validationRules: string,
    apiUrl: string,
    apiKey?: string
  ): Promise<{ isValid: boolean; errors?: string[]; suggestions?: string[] }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          form_data: formData,
          validation_rules: validationRules,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI validation API error: ${response.statusText}`);
      }

      const result: any = await response.json();
      return {
        isValid: result.is_valid || result.valid || false,
        errors: result.errors || [],
        suggestions: result.suggestions || [],
      };
    } catch (error) {
      console.error('Error validating form with AI:', error);
      throw new Error('Failed to validate form with AI');
    }
  },

  /**
   * Create workflow using AI
   * @param description Workflow description
   * @param requirements Additional requirements
   * @param apiUrl AI workflow creation API URL
   * @param apiKey API key for AI service
   */
  async createWorkflowWithAI(
    description: string,
    requirements: string,
    apiUrl: string,
    apiKey?: string
  ): Promise<{
    workflow: any;
    steps: any[];
    connections: any[];
  }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description,
          requirements,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI workflow creation API error: ${response.statusText}`);
      }

      const result: any = await response.json();
      return {
        workflow: result.workflow || {},
        steps: result.steps || [],
        connections: result.connections || [],
      };
    } catch (error) {
      console.error('Error creating workflow with AI:', error);
      throw new Error('Failed to create workflow with AI');
    }
  },

  /**
   * Call external agent/AI endpoint
   * @param apiUrl Agent API URL
   * @param method HTTP method
   * @param headers Request headers
   * @param data Request body data
   */
  async callAgentEndpoint(
    apiUrl: string,
    method: string,
    headers: Record<string, string>,
    data: Record<string, any>
  ): Promise<any> {
    try {
      const response = await fetch(apiUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: method !== 'GET' ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        console.error(`Agent API returned ${response.status}: ${response.statusText}`);
        const errorText = await response.text();
        return {
          success: false,
          error: `Agent API error: ${response.status}`,
          details: errorText,
        };
      }

      // The async "dispatch" endpoints often return 202/200 with an empty body
      // (or plain text) because work continues in the background.
      // We therefore parse via `text()` and only JSON.parse when possible.
      const responseText = await response.text();
      let result: any = {};
      if (responseText && responseText.trim().length > 0) {
        try {
          result = JSON.parse(responseText);
        } catch {
          result = { raw: responseText };
        }
      }
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('Error calling agent endpoint:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
