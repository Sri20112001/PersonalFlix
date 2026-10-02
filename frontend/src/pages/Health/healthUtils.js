export function fmtBytes(n) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function findDuplicates(scenes) {
  const clusters = [];
  const visited = new Set();

  const cleanTitle = (t) => {
    if (!t) return "";
    return t
      .toLowerCase()
      .replace(/[\._\-\+\[\]\(\)]/g, " ")
      .replace(/\b(1080p|720p|480p|2160p|4k|uhd|fhd|hd|x264|x265|hevc|aac|mp4|mkv|avi)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  for (let i = 0; i < scenes.length; i++) {
    const a = scenes[i];
    if (visited.has(a._id)) continue;

    const group = [a];
    const aTitle = cleanTitle(a.title || a.file_name);
    const aDur = Math.round(a.duration || 0);
    const aSize = a.size_bytes || 0;

    for (let j = i + 1; j < scenes.length; j++) {
      const b = scenes[j];
      if (visited.has(b._id)) continue;

      const bTitle = cleanTitle(b.title || b.file_name);
      const bDur = Math.round(b.duration || 0);
      const bSize = b.size_bytes || 0;

      let isDuplicate = false;
      let reason = "";

      if (aSize > 0 && aSize === bSize) {
        isDuplicate = true;
        reason = "Exact identical file size";
      } else if (aDur > 10 && Math.abs(aDur - bDur) <= 2.0 && aTitle && aTitle === bTitle) {
        isDuplicate = true;
        reason = "Matching title & duration";
      } else if (aDur > 30 && Math.abs(aDur - bDur) <= 1.0 && aTitle.length > 6 && (aTitle.includes(bTitle) || bTitle.includes(aTitle))) {
        isDuplicate = true;
        reason = "Matching duration & name variant";
      }

      if (isDuplicate) {
        group.push({ ...b, matchReason: reason });
        visited.add(b._id);
      }
    }

    if (group.length > 1) {
      visited.add(a._id);
      group.sort((x, y) => (y.size_bytes || 0) - (x.size_bytes || 0));
      const totalSize = group.reduce((sum, x) => sum + (x.size_bytes || 0), 0);
      const keepSize = group[0].size_bytes || 0;
      clusters.push({
        id: `cluster-${a._id}`,
        title: a.title || a.file_name,
        potentialSavingsBytes: totalSize - keepSize,
        items: group,
      });
    }
  }

  clusters.sort((x, y) => y.potentialSavingsBytes - x.potentialSavingsBytes);
  return clusters;
}
