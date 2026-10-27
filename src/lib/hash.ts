/**
 * 内容指纹：只用来判断「磁盘上的文件是否被外部改过」，不承担安全职责。
 *
 * 之所以不用 crypto.subtle：它是异步的，写盘前的比较链路上会多一层 await，
 * 而这里只需要一个够敏感的短哈希。cyrb53 对文本足够，几十万字的 Markdown
 * 也是毫秒级。
 */
export function hashContent(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const high = 2097151 & h2
  const low = h1 >>> 0
  return `${high.toString(16).padStart(7, '0')}${low.toString(16).padStart(8, '0')}`
}
