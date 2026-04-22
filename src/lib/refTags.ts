import type { ReferenceAsset } from "./types";

export type RefTagPrefix = "img" | "vid" | "aud";

export function getTagPrefix(type: ReferenceAsset["type"]): RefTagPrefix {
  if (type === "video") return "vid";
  if (type === "audio") return "aud";
  return "img";
}

/**
 * Compute @img1/@vid1/@aud1 style tags for each reference.
 * Indexed per-type by array order.
 *
 * Example: [video, image, audio, image]
 *   → vid1, img1, aud1, img2
 */
export function getRefTags(refs: ReferenceAsset[]): Record<string, string> {
  const counters: Record<RefTagPrefix, number> = { img: 0, vid: 0, aud: 0 };
  const out: Record<string, string> = {};
  for (const r of refs) {
    const p = getTagPrefix(r.type);
    counters[p] += 1;
    out[r.id] = `@${p}${counters[p]}`;
  }
  return out;
}

/**
 * Expand UI-friendly tags (@img1) into BytePlus official natural-language
 * reference format ([Image 1]).
 *
 * Per the BytePlus Seedance 2.0 docs, the recommended pattern for
 * multi-image reference prompts is "[Image 1]xxx, [Image 2]xxx" because it
 * gives stronger instruction adherence than bare "Image 1".
 *
 * @example
 *   expandPromptTags("Boy from @img1 hugs corgi from @img2")
 *   // → "Boy from [Image 1] hugs corgi from [Image 2]"
 */
export function expandPromptTags(prompt: string): string {
  return prompt.replace(
    /@(img|vid|aud)(\d+)/gi,
    (_match, prefix: string, n: string) => {
      const lc = prefix.toLowerCase() as RefTagPrefix;
      const word =
        lc === "img" ? "Image" : lc === "vid" ? "Video" : "Audio";
      return `[${word} ${n}]`;
    }
  );
}
