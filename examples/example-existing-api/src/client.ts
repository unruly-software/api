import { APIClient } from '@unruly-software/api-client';
import { jsonPlaceholderAPI } from './api-definition';

const BASE_URL = 'https://jsonplaceholder.typicode.com';

export const jsonPlaceholderClient = new APIClient(jsonPlaceholderAPI, {
  resolver: async ({ definition, request, abortSignal }) => {
    const { metadata } = definition;
    let url = `${BASE_URL}${metadata.path}`;

    // Handle path parameters (e.g., {id} or {postId})
    if (request && typeof request === 'object') {
      for (const [key, value] of Object.entries(request)) {
        url = url.replace(`{${key}}`, String(value));
      }
    }

    const fetchOptions: RequestInit = {
      method: metadata.method,
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortSignal,
    };

    // Add body for POST/PUT requests
    if (metadata.method === 'POST' || metadata.method === 'PUT') {
      if (request && typeof request === 'object') {
        // Filter out path parameters from the request body
        const bodyData = { ...request };
        // if ('id' in bodyData) delete bodyData.id;
        // if ('postId' in bodyData) delete bodyData.postId;

        fetchOptions.body = JSON.stringify(bodyData);
      }
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  },
});

export type JSONPlaceholderClient = typeof jsonPlaceholderClient;
