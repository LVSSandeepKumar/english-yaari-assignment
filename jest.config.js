/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^\\.{1,2}/(.*/)?logger/logger\\.js$": "<rootDir>/tests/helpers/logger.mock.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        module: { type: "es6" },
      },
    ],
  },
  clearMocks: true,
  collectCoverageFrom: ["**/*.ts", "!server.ts", "!**/*.test.ts", "!dist/**", "!node_modules/**"],
};
