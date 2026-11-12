/**
 * Conventional commits. Her commit hangi modül + hangi gereksinim maddesini
 * kapattığını gövdede belirtir (master prompt §8 çalışma kuralı).
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "chore", "refactor", "test", "perf", "build", "ci", "revert"],
    ],
    "scope-empty": [1, "never"],
  },
};
