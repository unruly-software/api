import type { ImplementedAPIRouterWithMetadata } from '@unruly-software/api-server';
import type { Express, Request, Response } from 'express';

type ExpressErrorHandler = (input: {
  error: Error;
  req: Request;
  res: Response;
}) => void;

const defaultErrorHandler: ExpressErrorHandler = ({ error, res }) => {
  console.error(error);
  res.status(500).json({ error: error.message });
};

export type ExpressAPIMetadata = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
};

export const mountExpressApp = <CTX>(input: {
  app: Express;
  makeContext: (req: Request) => Promise<CTX>;
  handleError?: ExpressErrorHandler;
  router: ImplementedAPIRouterWithMetadata<ExpressAPIMetadata, CTX>;
}) => {
  const { app, router, makeContext, handleError = defaultErrorHandler } = input;
  const { definitions, dispatch } = router;

  const getHandler = (method: 'GET' | 'POST' | 'PUT' | 'DELETE') => {
    switch (method) {
      case 'GET':
        return app.get.bind(app);
      case 'POST':
        return app.post.bind(app);
      case 'PUT':
        return app.put.bind(app);
      case 'DELETE':
        return app.delete.bind(app);
    }
  };

  for (const [endpointName, endpoint] of Object.entries(definitions)) {
    const { method, path } = endpoint.metadata;

    const handler = getHandler(method);
    handler(path, async (req, res) => {
      const data = req.body;

      try {
        const result = await dispatch({
          endpoint: endpointName as keyof typeof definitions,
          context: await makeContext(req),
          data,
        });
        if (endpoint.response === null) {
          res.status(200).end();
        } else {
          res.status(200).json(result);
        }
      } catch (error) {
        handleError({ error: error as Error, req, res });
      }
    });
  }
};
