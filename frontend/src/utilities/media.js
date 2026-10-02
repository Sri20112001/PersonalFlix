export const videoUrl = (id) => `/api/video/${id}`;

export const subtitleUrl = (id) => `/api/subtitles/${id}`;

export const thumbUrl = (id) => `/thumbnails/${id}.jpg`;

export const chapterThumbUrl = (chapterId) => `/api/timestamps/${chapterId}/thumbnail`;

export const performerImage = (url) => {
  if (!url) return null;
  const base = url.split(/[\\/]/).pop();
  return `/performers/${base}`;
};
