/** Bỏ dấu tiếng Việt và chữ hoa để tìm kiếm ("thit" khớp "Thịt", "dau" khớp "Đậu"). */
export function foldVi(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** true khi mọi từ của câu tìm đều có trong một trong các trường. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = foldVi(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.map((f) => foldVi(f ?? '')).join(' ');
  return words.every((w) => hay.includes(w));
}
