// All uploaded photos are stored on Cloudinary (see backend/src/middleware/upload.ts)
// but served at their original, full-resolution URL everywhere they're
// displayed - a trip cover shown at ~170px tall, a 40px avatar, etc. all
// download the same multi-megapixel original. Cloudinary URLs support
// on-the-fly resizing/format transforms inserted right after "/upload/" in
// the path, so this only changes what's requested at display time - the
// stored URL (and everything else about uploads) is untouched.
const CLOUDINARY_UPLOAD_MARKER = "/upload/";

export function optimizedImageUrl(url: string, width: number): string {
  const markerIndex = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (markerIndex === -1) return url;

  const insertAt = markerIndex + CLOUDINARY_UPLOAD_MARKER.length;
  const transform = `f_auto,q_auto,w_${Math.round(width)}/`;
  return url.slice(0, insertAt) + transform + url.slice(insertAt);
}
