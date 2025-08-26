import { mountExpressApp } from '@unruly-software/api-server-express';
import * as express from 'express';
import { createUser, getUser, router } from './router';
import { InMemoryUserRepo } from './user-repo';

// Cannot work out why express types are not compatible with the build system
const app: express.Express = (express as any).default();

app.use(express.json());

mountExpressApp({
  app,
  router: router.implement({
    endpoints: {
      createUser,
      getUser,
    },
  }),
  makeContext: async () => {
    return {
      userRepo: InMemoryUserRepo.getSingleton(),
    };
  },
});

export const startServer = (port: number): Promise<{ close: () => void }> => {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, (error) => {
      if (error) {
        reject(error);
        return;
      }
      console.log(`Example app listening on port ${port}`);
    });

    resolve({
      close: () => {
        server.close();
      },
    });
  });
};
