import { ScreenShareFramerateCap, ScreenShareResolutionCap } from './types';

/** Everything the call controls read, without the means to change any of it. */
export interface CallControlSnapshot {
  readonly microphone: boolean;
  readonly video: boolean;
  readonly sound: boolean;
  readonly screenshare: boolean;
  readonly spotlight: boolean;
  readonly screenShareResolution: ScreenShareResolutionCap;
  readonly screenShareFramerate: ScreenShareFramerateCap;
}

export class CallControlState implements CallControlSnapshot {
  public readonly microphone: boolean;

  public readonly video: boolean;

  public readonly sound: boolean;

  public readonly screenshare: boolean;

  public readonly spotlight: boolean;

  public readonly screenShareResolution: ScreenShareResolutionCap;

  public readonly screenShareFramerate: ScreenShareFramerateCap;

  constructor(
    microphone: boolean,
    video: boolean,
    sound: boolean,
    screenshare = false,
    spotlight = false,
    screenShareResolution: ScreenShareResolutionCap = 'source',
    screenShareFramerate: ScreenShareFramerateCap = 60
  ) {
    this.microphone = microphone;
    this.video = video;
    this.sound = sound;
    this.screenshare = screenshare;
    this.spotlight = spotlight;
    this.screenShareResolution = screenShareResolution;
    this.screenShareFramerate = screenShareFramerate;
  }

  /**
   * Returns a copy with some fields replaced and the rest left as they are.
   * Rebuilding the whole state positionally is how fields get silently reset
   * back to their defaults.
   */
  public with(changes: Partial<CallControlState>): CallControlState {
    return new CallControlState(
      changes.microphone ?? this.microphone,
      changes.video ?? this.video,
      changes.sound ?? this.sound,
      changes.screenshare ?? this.screenshare,
      changes.spotlight ?? this.spotlight,
      changes.screenShareResolution ?? this.screenShareResolution,
      changes.screenShareFramerate ?? this.screenShareFramerate
    );
  }
}
