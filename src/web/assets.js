// Fotos (und kurze Videos) privat speichern: /api/media. Bilder werden vorher verkleinert.
async function shrink(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 2400, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 2_500_000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
    return b || file;
  } catch (e) { return file; }
}

export const assets = {
  async upload(file) {
    const body = await shrink(file);
    if (body.size > 4_200_000) throw new Error(file.type.startsWith('video') ? 'Videos über 4 MB gehen in der Web-Version noch nicht' : 'Datei zu groß (max. 4 MB nach Verkleinerung)');
    const r = await fetch('/api/media', { method: 'POST', headers: { 'content-type': body.type || file.type || 'application/octet-stream' }, body, credentials: 'same-origin' });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Hochladen fehlgeschlagen');
    return { id: j.id, url: '/api/media?id=' + j.id, contentType: j.contentType };
  },
  async delete(id) {
    await fetch('/api/media?a=del&id=' + encodeURIComponent(id), { method: 'POST', credentials: 'same-origin' });
  },
};
