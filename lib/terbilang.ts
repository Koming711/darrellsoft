/**
 * Convert a number to Indonesian words (terbilang).
 * Supports up to triliun (trillion).
 */
export function terbilang(n: number): string {
  if (n === 0) return 'nol';

  const negatif = n < 0;
  if (negatif) n = -n;

  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];
  const belasan = ['sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas',
    'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas'];

  function convert(num: number): string {
    if (num === 0) return '';

    if (num < 10) return satuan[num];
    if (num < 20) return belasan[num - 10];
    if (num < 100) {
      const s = Math.floor(num / 10);
      const r = num % 10;
      return satuan[s] + ' puluh' + (r ? ' ' + satuan[r] : '');
    }
    if (num < 200) {
      const r = num - 100;
      return 'seratus' + (r ? ' ' + convert(r) : '');
    }
    if (num < 1000) {
      const s = Math.floor(num / 100);
      const r = num % 100;
      return satuan[s] + ' ratus' + (r ? ' ' + convert(r) : '');
    }
    if (num < 2000) {
      const r = num - 1000;
      return 'seribu' + (r ? ' ' + convert(r) : '');
    }
    if (num < 1000000) {
      const s = Math.floor(num / 1000);
      const r = num % 1000;
      return convert(s) + ' ribu' + (r ? ' ' + convert(r) : '');
    }
    if (num < 1000000000) {
      const s = Math.floor(num / 1000000);
      const r = num % 1000000;
      return convert(s) + ' juta' + (r ? ' ' + convert(r) : '');
    }
    if (num < 1000000000000) {
      const s = Math.floor(num / 1000000000);
      const r = num % 1000000000;
      return convert(s) + ' miliar' + (r ? ' ' + convert(r) : '');
    }
    const s = Math.floor(num / 1000000000000);
    const r = num % 1000000000000;
    return convert(s) + ' triliun' + (r ? ' ' + convert(r) : '');
  }

  let result = convert(Math.floor(n));
  const desimal = Math.round((n - Math.floor(n)) * 100);

  if (desimal > 0) {
    result += ' koma ' + (desimal < 10 ? 'nol ' : '') + convert(desimal);
  }

  if (negatif) result = 'minus ' + result;

  return result.charAt(0).toUpperCase() + result.slice(1);
}
