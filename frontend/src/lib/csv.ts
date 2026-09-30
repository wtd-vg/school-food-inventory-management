/** Xuất CSV phía trình duyệt (không thư viện). UTF-8 có BOM để Excel hiển thị đúng tiếng Việt. */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const body = rows.map((r) => r.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['﻿', body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
