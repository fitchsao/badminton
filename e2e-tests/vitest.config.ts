import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 20000,
    hookTimeout: 30000,
    // 关键:测试用例顺序执行,避免互相干扰
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
