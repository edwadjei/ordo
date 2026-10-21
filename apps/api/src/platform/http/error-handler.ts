import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ApiFailure } from './api-failure.js';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiFailure)
      return reply
        .code(error.status)
        .send({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: 'INVALID_INPUT',
          message: 'Check the required fields and their formats.',
        },
      });
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 413)
      return reply.code(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'The request is too large.',
        },
      });
    if (statusCode === 400)
      return reply.code(400).send({
        error: {
          code: 'INVALID_INPUT',
          message: 'The request body is invalid.',
        },
      });
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed. Please retry.',
      },
    });
  });
}
