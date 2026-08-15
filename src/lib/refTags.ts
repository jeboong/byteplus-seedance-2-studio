import type { ReferenceAsset } from "./types";

export type RefTagPrefix = "img" | "vid" | "aud";
type RefTagAlias = RefTagPrefix | "image" | "video" | "audio";

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
 * How UI tags are expanded into the official prompt reference format:
 * - "bracket" — "[Image 1]" style, recommended by the Seedance 2.0 docs for
 *   stronger instruction adherence than bare "Image 1".
 * - "at" — "@Image1" style, the official Seedance 2.5 prompt-rule format
 *   ("Use @Image 1, @Video 1, and @Audio 1 to refer to reference assets").
 */
export type RefTagStyle = "bracket" | "at";

/**
 * Expand UI-friendly tags (@img1) into the provider's official
 * natural-language reference format.
 *
 * @example
 *   expandPromptTags("Boy from @img1 hugs corgi from @img2")
 *   // → "Boy from [Image 1] hugs corgi from [Image 2]"
 *   expandPromptTags("Boy from @img1", refs, "at")
 *   // → "Boy from @Image1"
 */
export function expandPromptTags(
  prompt: string,
  activeRefs?: ReferenceAsset[],
  style: RefTagStyle = "bracket"
): string {
  const allowedTags = activeRefs
    ? new Set(
        Object.values(getRefTags(activeRefs)).flatMap((tag) => {
          const n = tag.replace(/^\D+/, "");
          if (tag.startsWith("@img")) return [tag, `@image${n}`];
          if (tag.startsWith("@vid")) return [tag, `@video${n}`];
          return [tag, `@audio${n}`];
        }).map((tag) => tag.toLowerCase())
      )
    : null;

  return prompt.replace(
    /@(img|image|vid|video|aud|audio)(\d+)/gi,
    (match, prefix: string, n: string) => {
      if (allowedTags && !allowedTags.has(match.toLowerCase())) {
        return match;
      }
      const lc = prefix.toLowerCase() as RefTagAlias;
      const word = lc === "img" || lc === "image"
        ? "Image"
        : lc === "vid" || lc === "video"
        ? "Video"
        : "Audio";
      return style === "at" ? `@${word}${n}` : `[${word} ${n}]`;
    }
  );
}
