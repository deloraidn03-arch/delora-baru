export const formatIDR = (n: number | null | undefined): string =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

export const formatNumber = (n: number | null | undefined): string =>
  Math.round(Number(n) || 0).toLocaleString('id-ID');

export const parseNumber = (s: string | number): number =>
  Number(String(s).replace(/[^\d-]/g, '')) || 0;

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

export const formatDate = (d: string | null | undefined): string => {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const currentMonthYear = () => {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
};
