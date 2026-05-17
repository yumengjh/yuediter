/**
 * docId ↔ slug 可逆编解码
 *
 * docId 格式: doc_{13位时间戳}_{8位hex}
 * slug 格式: {base36时间戳}-{hex}
 *
 * 示例: doc_1778802791624_e460c54d → 2w5j1bc-e460c54d
 */

const BASE36_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

function toBase36(num: number): string {
  if (num === 0) return "0";
  let result = "";
  while (num > 0) {
    result = BASE36_CHARS[num % 36] + result;
    num = Math.floor(num / 36);
  }
  return result;
}

function fromBase36(str: string): number {
  return parseInt(str, 36);
}

export function encodeDocId(docId: string): string {
  const rest = docId.slice(4); // 去掉 "doc_"
  const underscoreIdx = rest.indexOf("_");
  const timestamp = rest.slice(0, underscoreIdx);
  const hex = rest.slice(underscoreIdx + 1);
  return `${toBase36(Number(timestamp))}-${hex}`;
}

export function decodeDocSlug(slug: string): string {
  const dashIdx = slug.indexOf("-");
  const base36Ts = slug.slice(0, dashIdx);
  const hex = slug.slice(dashIdx + 1);
  const timestamp = fromBase36(base36Ts);
  return `doc_${timestamp}_${hex}`;
}
