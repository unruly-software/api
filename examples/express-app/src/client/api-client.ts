import { APIClient } from '@unruly-software/api-client';
import { apiDefinition } from '../api-definition';

export const buildAPIClient = (baseUrl: string) => {
  return new APIClient(apiDefinition, {
    resolver: async ({ definition, request, abortSignal }) => {
      const result = await fetch(`${baseUrl}${definition.metadata.path}`, {
        method: definition.metadata.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: abortSignal,
      });

      if (!result.ok) {
        let error = new Error(
          `API request failed with status ${result.status}`,
        );
        try {
          const body = await result.json();
          if (body?.error) {
            error = new Error(body.error);
          }
        } catch {}

        throw error;
      }

      return result.json();
    },
  });
};
