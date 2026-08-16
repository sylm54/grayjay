/** Shapes returned by pmvhaven.com JSON APIs and NUXT page payloads. */

export interface ApiVideo {
  _id: string;
  title: string;
  description?: string;
  duration?: string;
  durationSeconds?: number;
  views?: number;
  likes?: number;
  dislikes?: number;
  uploadDate?: string;
  uploader?: string;
  uploaderId?: string;
  uploaderUsername?: string;
  uploaderAvatarUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  width?: number;
  height?: number;
  bayesianRating?: number;
  tags?: string[];
  top5Tags?: string[];
  music?: Array<{ artist?: string; song?: string }>;
  hlsEnabled?: boolean;
  hlsStatus?: string;
  hlsMasterPlaylistUrl?: string;
  hlsVariants?: Array<{
    resolution?: string;
    width?: number;
    height?: number;
    bandwidth?: number;
    playlistUrl?: string;
  }>;
  videoUrl?: string;
  isReleased?: boolean;
  moderationStatus?: string;
}

export interface ApiComment {
  _id: string;
  username?: string;
  userId?: string;
  avatarUrl?: string | null;
  text?: string;
  createdAt?: string;
  likes?: number;
  dislikes?: number;
  replies?: ApiComment[];
  shadowBanned?: boolean;
}

export interface ApiPagination {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
}

export interface SearchResponse {
  success?: boolean;
  videos?: ApiVideo[];
  pagination?: ApiPagination;
}

export interface TrendingResponse {
  success?: boolean;
  videos?: ApiVideo[];
}

export interface CommentsResponse {
  success?: boolean;
  data?: ApiComment[];
  pagination?: ApiPagination;
}

export interface TagAutocompleteResponse {
  success?: boolean;
  data?: Array<{ name: string; type?: string; usageCount?: number }>;
}

export interface ApiPlaylist {
  _id: string;
  name: string;
  description?: string;
  owner?: string;
  ownerId?: string;
  ownerUsername?: string;
  ownerAvatarUrl?: string;
  thumbnailUrl?: string;
  videoCount?: number;
  views?: number;
  createdAt?: string;
  updatedAt?: string;
  videoDetails?: ApiVideo[];
  videos?: string[];
}

export interface ApiChannelUser {
  userId?: string;
  username: string;
  avatarUrl?: string;
  bannerUrl?: string;
  bio?: string;
  subscribersCount?: number;
  isVerifiedCreator?: boolean;
  createdAt?: string;
  videos?: ApiVideo[];
  playlists?: ApiPlaylist[];
  socialLinks?: Record<string, string>;
}
