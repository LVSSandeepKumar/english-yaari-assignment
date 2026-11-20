import { jest } from "@jest/globals";

export const logger = {
  info: jest.fn(),
  error: jest.fn(),
  child: jest.fn(() => logger), // so logger.child({...}) still works
};