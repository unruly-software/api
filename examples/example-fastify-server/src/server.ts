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

  // Generic handler for all API endpoints
  fastify.post('/api/:endpoint', async (request, reply) => {
    try {
      const endpointName = request.params as { endpoint: string };
      const context = createContext();

      // Dispatch the request to the appropriate endpoint handler
      const result = await implementedRouter.dispatch({
        endpoint:
          endpointName.endpoint as keyof typeof implementedRouter.definitions,
        data: request.body as any,
        context,
      });

      return result;
    } catch (error) {
      fastify.log.error(error);
      reply.status(500);
      return {
        error: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  });

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
