// @rev kc-31
const MOBILE_CODES = new Set([
  '700', '701', '702', '703', '704', '705', '706', '707', '708',
  '747', '750', '751', '760', '761', '762', '763', '764',
  '771', '775', '776', '777', '778',
]);

export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return null;

  const digits = trimmed.replace(/\D/g, '');
  const plus = trimmed.startsWith('+');

  let national: string;
  if (plus && digits.length === 11 && digits.startsWith('7')) national = digits.slice(1);
  else if (!plus && digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) national = digits.slice(1);
  else return null;

  if (!MOBILE_CODES.has(national.slice(0, 3))) return null;
  return `+7${national}`;
}
