// A fixed bit grid distinguishes every safe integer type ID, including variants with identical silhouettes.
export function typeMark(typeId: number): string {
  let bits = BigInt(typeId);
  let path = '';
  for (let cell = 0; bits; cell++, bits >>= 1n) {
    if (bits & 1n) path += `M${1 + (cell % 9) * 2} ${24 + Math.floor(cell / 9) * 2}h1v1h-1z`;
  }
  return path;
}
