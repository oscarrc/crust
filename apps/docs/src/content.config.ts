import { defineCollection } from "astro:content";
import { file } from "astro/loaders";
import { z } from "astro/zod";

// Footer socials. The file() loader needs a unique `id` per entry, but the
// data shape we want to author is just name/url/icon — so derive `id` from
// `name` in the parser instead of duplicating it in the JSON.
const socials = defineCollection({
  loader: file("src/content/socials.json", {
    parser: (text) =>
      JSON.parse(text).map((social: Record<string, unknown>) => ({
        id: social.name,
        ...social,
      })),
  }),
  schema: z.object({
    name: z.string(),
    url: z.url(),
    // SVG filename in src/assets, resolved to a component at render time.
    icon: z.string(),
  }),
});

export const collections = { socials };
