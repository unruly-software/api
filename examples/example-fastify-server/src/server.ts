import Fastify, { type FastifyInstance } from 'fastify';
import {
  InMemoryCommentRepo,
  InMemoryPostRepo,
  InMemoryUserRepo,
} from './repositories';
import { type AppContext, implementedRouter } from './router';

export const createFastifyApp = (): FastifyInstance => {
  const fastify = Fastify({
    logger: true,
  });

  // Create context with in-memory repositories
  const createContext = (): AppContext => ({
    userRepo: InMemoryUserRepo.getSingleton(),
    postRepo: InMemoryPostRepo.getSingleton(),
    commentRepo: InMemoryCommentRepo.getSingleton(),
  });

  // Register specific routes for each API endpoint
  Object.entries(implementedRouter.definitions).forEach(
    ([endpointName, definition]) => {
      const { method, path } = definition.metadata;

      // Convert JSONPlaceholder path format to Fastify path format
      // e.g., "/posts/{id}" becomes "/posts/:id"
      const fastifyPath = path.replace(/\{([^}]+)\}/g, ':$1');

      const routeHandler = async (request: any, reply: any) => {
        try {
          const context = createContext();

          // Merge path parameters with request body for the endpoint data
          const pathParams = request.params || {};
          let requestData: any;

          if (method === 'GET') {
            // For GET requests, the request data comes from path parameters
            requestData =
              Object.keys(pathParams).length > 0 ? pathParams : undefined;
          } else {
            // For POST requests, merge path parameters with request body
            requestData = { ...pathParams, ...(request.body || {}) };
          }

          // Dispatch the request to the appropriate endpoint handler
          const result = await implementedRouter.dispatch({
            endpoint:
              endpointName as keyof typeof implementedRouter.definitions,
            data: requestData,
            context,
          });

          return result;
        } catch (error) {
          fastify.log.error(error);
          reply.status(500);
          return {
            error:
              error instanceof Error ? error.message : 'Internal server error',
          };
        }
      };

      // Register the route with the appropriate HTTP method
      fastify.route({
        url: fastifyPath,
        method,
        handler: routeHandler,
      });

      fastify.log.info(
        `Registered ${method} ${fastifyPath} for endpoint ${endpointName}`,
      );
    },
  );

  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return fastify;
};

export const startServer = async (
  port: number,
): Promise<{
  close: () => Promise<void>;
  address: string;
}> => {
  const fastify = createFastifyApp();

  try {
    const address = await fastify.listen({ port, host: '127.0.0.1' });
    console.log(`Fastify server listening on ${address}`);

    return {
      address,
      close: async () => {
        await fastify.close();
      },
    };
  } catch (error) {
    fastify.log.error(error);
    throw error;
  }
};

// If this file is run directly, start the server
if (process.argv[1]?.includes('server.ts')) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  startServer(port).catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
