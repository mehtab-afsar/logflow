import type { Config } from "jest";

const config: Config = {
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
      testPathIgnorePatterns: ["<rootDir>/__tests__/driver-queue.test.ts"],
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          { tsconfig: { moduleResolution: "node", esModuleInterop: true, paths: { "@/*": ["./*"] } } },
        ],
      },
    },
    {
      // The offline upload queue needs a DOM + a fake IndexedDB.
      displayName: "jsdom",
      preset: "ts-jest",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/__tests__/driver-queue.test.ts"],
      setupFiles: ["<rootDir>/__tests__/setup/jsdom.ts"],
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          { tsconfig: { moduleResolution: "node", esModuleInterop: true, paths: { "@/*": ["./*"] } } },
        ],
      },
    },
  ],
};

export default config;
