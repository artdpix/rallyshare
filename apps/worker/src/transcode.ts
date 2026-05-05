import ffmpeg from 'fluent-ffmpeg';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

async function ensureDir(file: string) {
  await mkdir(dirname(file), { recursive: true });
}

function run(builder: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    builder.on('end', () => resolve()).on('error', (err) => reject(err)).run();
  });
}

export async function transcodeVideo(input: string, output: string): Promise<void> {
  await ensureDir(output);
  await run(
    ffmpeg(input)
      .videoCodec('libx264')
      .videoFilter(
        "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
      )
      .outputOptions(['-preset medium', '-crf 23', '-pix_fmt yuv420p', '-movflags +faststart'])
      .audioCodec('aac')
      .audioBitrate('128k')
      .output(output),
  );
}

export async function videoThumbnail(input: string, output: string): Promise<void> {
  await ensureDir(output);
  await run(
    ffmpeg(input)
      .seekInput(Math.min(3, 0))
      .seek(3)
      .frames(1)
      .videoFilter('scale=480:-2')
      .output(output),
  );
}

export async function transcodePhoto(input: string, output: string): Promise<void> {
  await ensureDir(output);
  await run(
    ffmpeg(input)
      .videoFilter(
        "scale='min(3840,iw)':'min(3840,ih)':force_original_aspect_ratio=decrease",
      )
      .outputOptions(['-q:v 3'])
      .output(output),
  );
}

export async function photoThumbnail(input: string, output: string): Promise<void> {
  await ensureDir(output);
  await run(
    ffmpeg(input)
      .videoFilter('scale=480:-2')
      .outputOptions(['-q:v 4'])
      .output(output),
  );
}
