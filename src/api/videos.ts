import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import { getVideo, updateVideo } from "../db/videos";
import type { BunRequest } from "bun";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";

export async function handlerUploadVideo(
  cfg: ApiConfig,
  req: BunRequest<"/api/video_upload/:videoId">,
) {
  const { videoId } = req.params;
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("Not authorized to update this video");
  }

  const formData = await req.formData();
  const file = formData.get("video");
  if (!(file instanceof File)) {
    throw new BadRequestError("Video file missing");
  }

  const MAX_UPLOAD_SIZE = 100 << 20; // 100MB

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(
      `Video file exceeds the maximum allowed size of 100MB`,
    );
  }

  const randomFilename = randomBytes(32).toString("base64url");
  const mediaType = file.type;
  const extension = mediaType.split("/")[1] || "bin";

  const filePath = path.join(cfg.assetsRoot, `${randomFilename}.${extension}`);

  const arrayBuffer = await file.arrayBuffer();
  if (!arrayBuffer) {
    throw new Error("Error reading file data");
  }

  await Bun.write(filePath, arrayBuffer);

  video.videoURL = `http://localhost:${cfg.port}/assets/${randomFilename}.${extension}`;
  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}
