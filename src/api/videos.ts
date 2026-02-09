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

  // Validate videoId is a valid UUID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(videoId)) {
    throw new BadRequestError("Invalid video ID format");
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

  // 1GB upload size limit (1 << 30 bytes)
  const MAX_UPLOAD_SIZE = 1 << 30;

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(
      `Video file exceeds the maximum allowed size of 1GB`,
    );
  }

  // Validate that the uploaded file is an MP4 video
  const mediaType = file.type;
  if (mediaType !== "video/mp4") {
    throw new BadRequestError(
      "Invalid file type. Only MP4 videos are allowed.",
    );
  }

  // Generate unique file key for S3 (32-byte hex + .mp4 extension)
  const randomHex = randomBytes(32).toString("hex");
  const fileKey = `${randomHex}.mp4`;

  // Create temporary file path
  const tempFilePath = path.join(process.env.TMPDIR || "/tmp", fileKey);

  let tempFileCreated = false;
  try {
    // Save uploaded file to temporary file
    await Bun.write(tempFilePath, file);
    tempFileCreated = true;
    console.log(`Saved video to temporary file: ${tempFilePath}`);

    // Upload to S3 using S3Client.file()
    // @ts-expect-error - Bun types may not include all options, but runtime supports bucket
    await cfg.s3Client.file(fileKey, Bun.file(tempFilePath), {
      bucket: cfg.s3Bucket,
      contentType: "video/mp4",
    });
    console.log(`Uploaded video to S3: ${fileKey}`);

    // Generate presigned URL for private S3 access (expires in 24 hours)
    // Presigned URLs contain amazonaws.com and work with AWS credentials
    const presignedUrl = await cfg.s3Client.presign(fileKey, {
      bucket: cfg.s3Bucket,
      region: cfg.s3Region,
      expiresIn: 60 * 60 * 24, // 24 hours
    });
    console.log(`Generated presigned URL for video`);

    // Update database with presigned URL, file size, and content type
    video.videoURL = presignedUrl;
    video.fileSize = file.size;
    video.contentType = mediaType;
    updateVideo(cfg.db, video);
    console.log(
      "Updated video record with presigned URL, file size, and content type",
    );

    return respondWithJSON(200, video);
  } finally {
    // Clean up temporary file even if errors occur
    if (tempFileCreated) {
      try {
        await Bun.file(tempFilePath).delete();
        console.log(`Cleaned up temporary file: ${tempFilePath}`);
      } catch (cleanupError) {
        console.error(`Failed to clean up temporary file: ${cleanupError}`);
      }
    }
  }
}
