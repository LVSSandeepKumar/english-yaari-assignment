import path from "node:path";
import pino from "pino";
import type { Logger as PinoLogger, LoggerOptions, TransportTargetOptions } from "pino";

const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL ?? (isProd ? "info" : "debug");
const logDir = process.env.LOG_DIR ?? path.resolve(process.cwd(), "logs");

const targets: TransportTargetOptions[] = [
  // 1. Everything goes to a file, in every environment
  {
    target: "pino/file",
    level,
    options: { destination: path.join(logDir, "app.log"), mkdir: true },
  },
  // 2. Errors only, in their own file for quick debugging
  {
    target: "pino/file",
    level: "error",
    options: { destination: path.join(logDir, "error.log"), mkdir: true },
  },
  // 3. Console: pretty locally, plain JSON in production
  isProd
    ? { target: "pino/file", level, options: { destination: 1 } } // 1 = stdout
    : {
        target: "pino-pretty",
        level,
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
];

const options: LoggerOptions = {
  level,
  base: { service: "english-yaari-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ["password", "token", "*.password", "*.token", "req.headers.authorization"],
    censor: "[REDACTED]",
  },
  serializers: { err: pino.stdSerializers.err },
  transport: { targets },
};

const baseLogger: PinoLogger = pino(options);

type Meta = Record<string, unknown>;

export interface AppLogger {
  info(message: string, meta?: Meta): void;
  error(message: string, error?: unknown, meta?: Meta): void;
  child(bindings: Meta): AppLogger;
}

const wrap = (pinoInstance: PinoLogger): AppLogger => ({
  info(message, meta = {}) {
    pinoInstance.info(meta, message);
  },

  error(message, error, meta = {}) {
    if (error instanceof Error) {
      pinoInstance.error({ ...meta, err: error }, message);
    } else if (error !== undefined) {
      // Non-Error throws (strings, objects) are still captured
      pinoInstance.error({ ...meta, error }, message);
    } else {
      pinoInstance.error(meta, message);
    }
  },

  child(bindings) {
    return wrap(pinoInstance.child(bindings));
  },
});

export const logger = wrap(baseLogger);
