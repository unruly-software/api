import { z } from 'zod';
import { createDocument } from 'zod-openapi';
import { todoAPI } from './api-definition.js';

function getPathParamNames(path: string): string[] {
  return Array.from(path.matchAll(/\{(\w+)\}/g), (m) => m[1]);
}

function pickKeys(schema: z.ZodObject<any>, keys: string[]) {
  if (keys.length === 0) return undefined;
  const mask = Object.fromEntries(keys.map((k) => [k, true]));
  return schema.pick(mask as any);
}

function splitRequestSchema(request: z.ZodType, pathParamNames: string[]) {
  if (!(request instanceof z.ZodObject)) {
    return { pathSchema: undefined, remainingSchema: request };
  }
  const allKeys = Object.keys(request.shape);
  const remainingKeys = allKeys.filter((k) => !pathParamNames.includes(k));
  return {
    pathSchema: pickKeys(request, pathParamNames),
    remainingSchema: pickKeys(request, remainingKeys),
  };
}

function getResponseEntries(response: z.ZodType) {
  const members =
    response instanceof z.ZodUnion
      ? (response.options as z.ZodType[])
      : [response];
  return members.flatMap((member) => {
    const meta = member.meta() as
      | { statusCode?: number; description?: string }
      | undefined;
    if (!meta?.statusCode) return [];
    return [
      {
        statusCode: String(meta.statusCode),
        description: meta.description ?? '',
        schema: member,
      },
    ];
  });
}

function generatePathsFromAPI() {
  const paths: Record<string, any> = {};

  Object.entries(todoAPI).forEach(([endpointName, endpoint]) => {
    const { method, path, summary, description, tags } = endpoint.metadata;
    const pathParamNames = getPathParamNames(path);
    const { pathSchema, remainingSchema } = splitRequestSchema(
      endpoint.request as z.ZodType,
      pathParamNames,
    );

    const operation: any = {
      summary,
      description,
      operationId: endpointName,
      tags,
      responses: {},
    };

    if (pathSchema) {
      operation.requestParams = { ...operation.requestParams, path: pathSchema };
    }

    if (remainingSchema) {
      const httpMethod = method.toUpperCase();
      if (httpMethod === 'GET' || httpMethod === 'DELETE') {
        operation.requestParams = {
          ...operation.requestParams,
          query: remainingSchema,
        };
      } else {
        operation.requestBody = {
          content: {
            'application/json': {
              schema: remainingSchema,
            },
          },
        };
      }
    }

    for (const { statusCode, description: responseDescription, schema } of getResponseEntries(
      endpoint.response as z.ZodType,
    )) {
      operation.responses[statusCode] = {
        description: responseDescription,
        content: {
          'application/json': {
            schema,
          },
        },
      };
    }

    if (!paths[path]) {
      paths[path] = {};
    }
    paths[path][method.toLowerCase()] = operation;
  });

  return paths;
}

export const openApiDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'TODO API',
    version: '1.0.0',
    description:
      'A type-safe TODO API demonstrating automatic OpenAPI generation from API client definitions',
    contact: {
      name: 'Unruly Software',
      url: 'https://github.com/unruly-software',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000/api',
      description: 'Development server',
    },
    {
      url: 'https://api.example.com',
      description: 'Production server',
    },
  ],
  paths: generatePathsFromAPI(),
  tags: [
    {
      name: 'Todos',
      description: 'Operations for managing todo items',
    },
  ],
});
