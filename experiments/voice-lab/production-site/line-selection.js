export function parseLineId(search = '') {
  const value = new URLSearchParams(search).get('line');
  return /^\d{3}$/.test(value ?? '') && Number(value) >= 1 && Number(value) <= 18 ? value : null;
}

export function lineUrl(locationLike, scriptId) {
  const url = new URL(locationLike.href);
  url.searchParams.set('line', scriptId);
  return url.toString();
}
