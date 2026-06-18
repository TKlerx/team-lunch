export type SeededRngSeed = string | number | bigint;

export interface SeededRng {
  next(): number;
  nextInt(maxExclusive: number): number;
  nextBetween(minInclusive: number, maxExclusive: number): number;
  pick<T>(values: readonly T[]): T | undefined;
  shuffle<T>(values: readonly T[]): T[];
  fork(label: SeededRngSeed): SeededRng;
}

function normalizeSeed(seed: SeededRngSeed): string {
  return String(seed);
}

function hashSeed(seed: SeededRngSeed): number {
  const input = normalizeSeed(seed);
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0) || 1;
}

function createGenerator(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRng(seed: SeededRngSeed): SeededRng {
  const seedText = normalizeSeed(seed);
  const nextFloat = createGenerator(hashSeed(seedText));

  return {
    next(): number {
      return nextFloat();
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
        throw new RangeError('maxExclusive must be greater than 0');
      }

      return Math.floor(nextFloat() * maxExclusive);
    },
    nextBetween(minInclusive: number, maxExclusive: number): number {
      if (!Number.isFinite(minInclusive) || !Number.isFinite(maxExclusive)) {
        throw new RangeError('Bounds must be finite numbers');
      }
      if (maxExclusive <= minInclusive) {
        throw new RangeError('maxExclusive must be greater than minInclusive');
      }

      return minInclusive + nextFloat() * (maxExclusive - minInclusive);
    },
    pick<T>(values: readonly T[]): T | undefined {
      if (values.length === 0) {
        return undefined;
      }

      return values[Math.floor(nextFloat() * values.length)];
    },
    shuffle<T>(values: readonly T[]): T[] {
      const result = [...values];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(nextFloat() * (index + 1));
        if (swapIndex !== index) {
          [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
        }
      }

      return result;
    },
    fork(label: SeededRngSeed): SeededRng {
      return createSeededRng(`${seedText}:${normalizeSeed(label)}`);
    },
  };
}
