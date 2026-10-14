import { API_URL } from "../api/client";

// All uploaded photos are stored on Cloudinary (see backend/src/middleware/upload.ts)
// but served at their original, full-resolution URL everywhere they're
// displayed - a trip cover shown at ~170px tall, a 40px avatar, etc. all
// download the same multi-megapixel original. Cloudinary URLs support
// on-the-fly resizing/format transforms inserted right after "/upload/" in
// the path, so this only changes what's requested at display time - the
// stored URL (and everything else about uploads) is untouched.
const CLOUDINARY_UPLOAD_MARKER = "/upload/";

// Older uploads were saved to the backend's local /uploads folder with whatever
// host the server ran on at the time (e.g. a LAN IP), which no longer resolves.
// Load those from the backend this build talks to instead.
const LOCAL_UPLOAD_PATH = /^https?:\/\/[^/]+(\/uploads\/.+)$/;

// Same idea for videos: Cloudinary re-encodes to a smaller file at the width
// asked for (q_auto/vc_auto), so phones don't download the full original.
export function optimizedVideoUrl(url: string, width: number): string {
  const localUpload = url.match(LOCAL_UPLOAD_PATH);
  if (localUpload) return API_URL.replace(/\/+$/, "") + localUpload[1];
  const markerIndex = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (markerIndex === -1) return url;
  const insertAt = markerIndex + CLOUDINARY_UPLOAD_MARKER.length;
  return url.slice(0, insertAt) + `q_auto,vc_auto,c_limit,w_${Math.round(width)}/` + url.slice(insertAt);
}

export function optimizedImageUrl(url: string, width: number): string {
  const localUpload = url.match(LOCAL_UPLOAD_PATH);
  if (localUpload) return API_URL.replace(/\/+$/, "") + localUpload[1];

  const markerIndex = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (markerIndex === -1) return url;

  const insertAt = markerIndex + CLOUDINARY_UPLOAD_MARKER.length;
  // c_limit: shrink to width but never upscale a smaller original.
  const transform = `f_auto,q_auto,c_limit,w_${Math.round(width)}/`;
  return url.slice(0, insertAt) + transform + url.slice(insertAt);
}
