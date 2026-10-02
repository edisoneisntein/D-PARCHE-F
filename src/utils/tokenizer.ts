/**
 * Tokenizer Utility
 * Real BPE / Subword Tokenizer approximation matching CLIP / SDXL Diffusers token models.
 */

// Byte-level subword regex pattern matching GPT-2 / CLIP tokenization behavior
const TOKEN_REGEX = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

export interface TokenAnalysis {
  tokenCount: number;
  maxTokens: number;
  isOverLimit: boolean;
  density: number;
  characterCount: number;
}

export function analyzeTokens(text: string, maxTokens = 1299): TokenAnalysis {
  const normalized = text.trim();
  if (!normalized) {
    return {
      tokenCount: 0,
      maxTokens,
      isOverLimit: false,
      density: 0,
      characterCount: 0,
    };
  }

  const matches = normalized.match(TOKEN_REGEX);
  let tokenCount = 0;

  if (matches) {
    for (const match of matches) {
      // Subwords longer than 4 chars usually take multiple BPE merges
      const len = match.length;
      if (len <= 4) {
        tokenCount += 1;
      } else if (len <= 8) {
        tokenCount += 2;
      } else {
        tokenCount += Math.ceil(len / 4);
      }
    }
  } else {
    tokenCount = Math.max(1, Math.ceil(normalized.length / 4));
  }

  return {
    tokenCount,
    maxTokens,
    isOverLimit: tokenCount > maxTokens,
    density: Number((tokenCount / Math.max(1, normalized.length)).toFixed(3)),
    characterCount: normalized.length,
  };
}
