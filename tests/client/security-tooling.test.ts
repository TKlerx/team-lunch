import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);

it("builds nested Tailwind CSS with the security-patched selector parser", async () => {
  const result = await postcss([
    require("tailwindcss/nesting")(),
    tailwindcss({
      content: [
        { raw: '<div class="hover:bg-red-500 [&>span]:font-bold"></div>' },
      ],
      corePlugins: { preflight: false },
      plugins: [],
    }),
  ]).process(
    "@tailwind utilities; .card { @apply font-bold; & > span { @apply text-red-500; } }",
    {
      from: undefined,
    },
  );
  expect(result.css).toContain("font-weight: 700");
  expect(result.css).toContain(".card > span");
  expect(result.css).toContain(":hover");
  expect(result.css).toContain(">span");
});

it("round-trips shell arguments containing comments and line terminators", () => {
  const requireConcurrently = createRequire(require.resolve("concurrently"));
  const shellQuote = requireConcurrently("shell-quote");
  const argument = "{ comment }\n$(echo unsafe)";
  expect(shellQuote.parse(shellQuote.quote([argument]))).toEqual([argument]);
});
