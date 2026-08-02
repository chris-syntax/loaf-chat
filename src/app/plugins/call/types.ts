export enum ElementCallIntent {
  StartCall = 'start_call',
  JoinExisting = 'join_existing',
  StartCallVoice = 'start_call_voice',
  JoinExistingVoice = 'join_existing_voice',
  StartCallDM = 'start_call_dm',
  JoinExistingDM = 'join_existing_dm',
  StartCallDMVoice = 'start_call_dm_voice',
  JoinExistingDMVoice = 'join_existing_dm_voice',
}

export type ElementCallThemeKind = 'light' | 'dark';

export type ElementMediaStatePayload = {
  audio_enabled?: boolean;
  video_enabled?: boolean;
};
export type ElementMediaStateDetail = {
  data?: ElementMediaStatePayload;
};

/**
 * A cap on the resolution of a screen share: an upper bound, never a target.
 * The named entries stand for 16:9 bounding boxes, so a source is fitted
 * inside with its aspect ratio preserved and is never scaled up. 'source'
 * means uncapped.
 */
export type ScreenShareResolutionCap = 'source' | 1440 | 1080 | 720 | 480;

/** A cap on the framerate a screen share's encoder is asked to produce. */
export type ScreenShareFramerateCap = 60 | 30 | 15;

/** The ladders offered in the menu, largest first. */
export const screenShareResolutionCaps: ScreenShareResolutionCap[] = [
  'source',
  1440,
  1080,
  720,
  480,
];
export const screenShareFramerateCaps: ScreenShareFramerateCap[] = [60, 30, 15];

export type ScreenShareQualityPayload = {
  resolution_cap?: ScreenShareResolutionCap;
  framerate_cap?: ScreenShareFramerateCap;
};
export type ScreenShareQualityDetail = {
  data?: ScreenShareQualityPayload;
};

export enum ElementWidgetActions {
  JoinCall = 'io.element.join',
  HangupCall = 'im.vector.hangup',
  Close = 'io.element.close',
  DeviceMute = 'io.element.device_mute',
  /**
   * Screen share quality caps. Element Call owns and persists these, and
   * broadcasts them whenever they change — including on load — so we adopt
   * whatever it reports rather than keeping our own copy across calls.
   */
  ScreenShareQuality = 'io.element.screen_share_quality',
}
