export type PanelName = 'createLibrary' | 'createProject' | 'createShare' | 'shareLinks' | 'addToProject' | null;

export interface User {
  username: string;
}

export interface Library {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  library_id: string | null;
  created_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_path: string;
  file_size: number | null;
  mtime: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  bitrate: number | null;
  video_codec: string | null;
  scan_status: 'pending' | 'done' | 'error';
  scan_error?: string | null;
  added_at: string;
}

export interface BrowseEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_video: boolean;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export interface ProbeData {
  duration_seconds: number;
  duration_ticks: number;
  width: number;
  height: number;
  bitrate: number;
  video_codec: string;
  pix_fmt: string;
  bit_depth: number | null;
  audio_codec: string;
}

export interface BitrateTier {
  key: string;
  label: string;
  bitrate: number;
  max_height: number | null;
}

export interface Capabilities {
  bitrate_tiers: BitrateTier[];
  hardware: Record<string, boolean>;
}

export interface Share {
  id: string;
  project_id: string;
  created_at: string;
  expires_at: string | null;
}

export interface ShareResponse {
  share_id: string;
  password: string;
  expires_at: string | null;
}

export interface TranscodeStats {
  fps?: number;
  speed?: number;
}

export interface LutEntry {
  id: string;
  name: string;
  camera: string;
  log_profile: string;
  lut_type: string;
  file_path: string;
}

export interface SelectionItem {
  type: 'file' | 'folder';
  path: string;
}

export interface ShareFile {
  id: number;
  file_path: string;
  file_size: number;
  duration_seconds: number | null;
  width: number;
  height: number;
  bitrate: number;
  video_codec: string;
  scan_status: 'pending' | 'done' | 'error';
}
