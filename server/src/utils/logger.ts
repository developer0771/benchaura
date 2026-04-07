// server/src/utils/logger.ts
// Pino structured logger — outputs JSON in production, pretty-prints in dev.
// Every log line includes timestamp, level, and context object.
// In production these JSON lines ship directly to Datadog/Logtail/CloudWatch.

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, ignore: 'pid,hostname', translateTime: 'HH:MM:ss' },
    },
  }),
  base: { service: 'benchaura-signaling' },
  // Redact sensitive fields from all log lines
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.apiKey', '*.credential'],
    censor: '[REDACTED]',
  },
});

// Child loggers carry context through a request lifecycle
export function roomLogger(roomCode: string) {
  return logger.child({ roomCode });
}

export function socketLogger(socketId: string) {
  return logger.child({ socketId });
}
