import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/error";

// Hero banner media: images and short background videos.
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 60 * 1024 * 1024;

const cloudinaryConfigured = !!(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);
const LOCAL_DIR = "hero";

type Sniffed = { kind: "IMAGE" | "VIDEO"; ext: string; mime: string };

// Identify the file from its first bytes. The browser-supplied type and the file
// name are ignored, so a renamed script, HTML page or SVG can't get through.
export function sniff(buf: Buffer): Sniffed | null {
  if (buf.length < 12) return null;
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString("latin1");
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "IMAGE", ext: "jpg", mime: "image/jpeg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: "IMAGE", ext: "png", mime: "image/png" };
  }
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { kind: "IMAGE", ext: "webp", mime: "image/webp" };
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    // QuickTime (.mov) shares the container; browsers play its H.264 fine.
    if (brand === "qt  ") return { kind: "VIDEO", ext: "mov", mime: "video/quicktime" };
    if (/^(avif|avis|heic|heix|mif1|msf1)$/.test(brand)) return null; // still images in an ISO container
    return { kind: "VIDEO", ext: "mp4", mime: "video/mp4" };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: "VIDEO", ext: "webm", mime: "video/webm" };
  return null;
}

const ACCEPTED_DECLARED = /^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime))$/;

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_DECLARED.test(file.mimetype)) return cb(new HttpError(415, "Use a JPG, PNG or WebP image, or an MP4 or WebM video."));
    cb(null, true);
  },
});

// Single "file" field; multer's own errors become clear 4xx responses.
export function heroUpload(req: Request, res: Response, next: NextFunction) {
  multerUpload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(new HttpError(413, `Videos can be up to ${VIDEO_MAX_BYTES / 1024 / 1024} MB and images up to ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`));
    }
    next(err instanceof HttpError ? err : new HttpError(400, err instanceof Error ? err.message : "Upload failed"));
  });
}

export interface StoredMedia {
  mediaType: "IMAGE" | "VIDEO";
  url: string;
  key: string;
  // For videos: a still frame to show while loading or where video can't play.
  posterUrl: string | null;
  bytes: number;
}

// Validates and stores an uploaded hero file. Cloudinary when configured (it serves
// resized/compressed variants from the URL); the local uploads folder otherwise.
export async function storeHeroMedia(file: Express.Multer.File | undefined, expect?: "IMAGE"): Promise<StoredMedia> {
  if (!file) throw new HttpError(400, "Choose a file to upload");
  const found = sniff(file.buffer);
  if (!found) throw new HttpError(415, "That file isn't a supported image or video.");
  if (expect && found.kind !== expect) throw new HttpError(415, "Use an image here.");
  if (found.kind === "IMAGE" && file.size > IMAGE_MAX_BYTES) {
    throw new HttpError(413, `Images can be up to ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`);
  }

  if (cloudinaryConfigured) {
    const resourceType = found.kind === "VIDEO" ? "video" : "image";
    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: "travel-social/hero", resource_type: resourceType }, (err, res) =>
          err || !res ? reject(err ?? new Error("Upload failed")) : resolve(res)
        )
        .end(file.buffer);
    });
    // Cloudinary renders a poster from the first frame on request.
    const posterUrl =
      found.kind === "VIDEO" ? result.secure_url.replace("/upload/", "/upload/so_0/").replace(/\.[a-z0-9]+$/i, ".jpg") : null;
    return { mediaType: found.kind, url: result.secure_url, key: `cloudinary:${resourceType}:${result.public_id}`, posterUrl, bytes: file.size };
  }

  // Hosts like Render wipe local disk on every restart, so production must use Cloudinary.
  if (process.env.NODE_ENV === "production") {
    throw new HttpError(500, "Uploads aren't configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
  }
  const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${found.ext}`;
  const dir = path.resolve(env.uploadsDir, LOCAL_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), file.buffer);
  return {
    mediaType: found.kind,
    url: `${env.publicBaseUrl.replace(/\/+$/, "")}/uploads/${LOCAL_DIR}/${name}`,
    key: `local:${LOCAL_DIR}/${name}`,
    posterUrl: null,
    bytes: file.size,
  };
}

// Removes a stored file; failures are logged, never thrown (the banner change already happened).
export async function deleteHeroMedia(key: string | null | undefined) {
  if (!key) return;
  try {
    const cloud = key.match(/^cloudinary:(image|video):(.+)$/);
    if (cloud && cloudinaryConfigured) {
      await cloudinary.uploader.destroy(cloud[2], { resource_type: cloud[1] });
      return;
    }
    const local = key.match(/^local:hero\/([\w.-]+)$/);
    if (local) await fs.unlink(path.resolve(env.uploadsDir, LOCAL_DIR, local[1]));
  } catch (err) {
    console.warn("Couldn't delete hero media", key, err);
  }
}

// Media URLs a banner may point at: only files this server stored.
export function isOurMediaUrl(url: string) {
  if (cloudinaryConfigured && url.startsWith(`https://res.cloudinary.com/${env.cloudinary.cloudName}/`)) return true;
  return /^https?:\/\/[^/]+\/uploads\/hero\/[\w.-]+$/.test(url);
}
