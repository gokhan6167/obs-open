import base from "@obs/config/eslint";

export default [
  ...base,
  {
    // Vercel serverless glue dosyası (düz JS, dist'i re-export eder) — TS
    // project service kapsamı dışında; lint'ten muaf.
    ignores: ["api/**"],
  },
  {
    rules: {
      // NestJS DI dekoratörleri ve provider tokenları için gevşetmeler.
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
];
