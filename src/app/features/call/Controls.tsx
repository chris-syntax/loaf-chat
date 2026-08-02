import React, { MouseEventHandler, useState } from 'react';
import {
  Box,
  config,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  Tooltip,
  TooltipProvider,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAtom } from 'jotai';
import * as css from './styles.css';
import { callChatAtom } from '../../state/callEmbed';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { stopPropagation } from '../../utils/keyboard';
import {
  ScreenShareFramerateCap,
  screenShareFramerateCaps,
  ScreenShareQualityPayload,
  ScreenShareResolutionCap,
  screenShareResolutionCaps,
} from '../../plugins/call';

export function ControlDivider() {
  return (
    <Line variant="SurfaceVariant" size="300" direction="Vertical" className={css.ControlDivider} />
  );
}

type MicrophoneButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
};
export function MicrophoneButton({ enabled, onToggle }: MicrophoneButtonProps) {
  const [micState, toggleMic] = useAsyncCallback(onToggle);
  const loading = micState.status === AsyncStatus.Loading;
  
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Turn Off Microphone' : 'Turn On Microphone'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Surface' : 'Warning'}
          fill="Soft"
          radii="400"
          size="400"
          onClick={toggleMic}
          outlined
          disabled={loading}
        >
          <Icon size="400" src={enabled ? Icons.Mic : Icons.MicMute} filled={!enabled} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type SoundButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function SoundButton({ enabled, onToggle }: SoundButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Turn Off Sound' : 'Turn On Sound'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Surface' : 'Warning'}
          fill="Soft"
          radii="400"
          size="400"
          onClick={() => onToggle()}
          outlined
        >
          <Icon
            size="400"
            src={enabled ? Icons.Headphone : Icons.HeadphoneMute}
            filled={!enabled}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type VideoButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
};
export function VideoButton({ enabled, onToggle }: VideoButtonProps) {
  const [videoState, toggleVideo] = useAsyncCallback(onToggle);
  const loading = videoState.status === AsyncStatus.Loading;

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Stop Camera' : 'Start Camera'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Success' : 'Surface'}
          fill="Soft"
          radii="400"
          size="400"
          onClick={toggleVideo}
          outlined
          disabled={loading}
        >
          <Icon
            size="400"
            src={enabled ? Icons.VideoCamera : Icons.VideoCameraMute}
            filled={enabled}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type ScreenShareButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function ScreenShareButton({ enabled, onToggle }: ScreenShareButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Stop Screenshare' : 'Start Screenshare'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Success' : 'Surface'}
          fill="Soft"
          radii="400"
          size="400"
          onClick={() => onToggle()}
          outlined
        >
          <Icon size="400" src={Icons.ScreenShare} filled={enabled} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

function resolutionLabel(cap: ScreenShareResolutionCap): string {
  return cap === 'source' ? 'Source' : `${cap}p`;
}

type ScreenShareQualityButtonProps = {
  resolution: ScreenShareResolutionCap;
  framerate: ScreenShareFramerateCap;
  onSelect: (quality: ScreenShareQualityPayload) => void;
};
/**
 * The sharer's own quality caps, sitting beside the screen share toggle. A cap
 * is a ceiling, never a target: picking one above your source does nothing,
 * and nothing is ever scaled up.
 */
export function ScreenShareQualityButton({
  resolution,
  framerate,
  onSelect,
}: ScreenShareQualityButtonProps) {
  const [cords, setCords] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (quality: ScreenShareQualityPayload) => {
    onSelect(quality);
    setCords(undefined);
  };

  return (
    <PopOut
      anchor={cords}
      position="Top"
      align="Center"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setCords(undefined),
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu>
            <Box direction="Column" style={{ padding: config.space.S100 }}>
              {screenShareResolutionCaps.map((cap) => (
                <MenuItem
                  key={`resolution-${cap}`}
                  size="300"
                  variant="Surface"
                  radii="300"
                  aria-checked={resolution === cap}
                  onClick={() => handleSelect({ resolution_cap: cap })}
                  after={resolution === cap && <Icon size="50" src={Icons.Check} />}
                >
                  <Text size="B300" truncate>
                    {resolutionLabel(cap)}
                  </Text>
                </MenuItem>
              ))}
              <Line variant="SurfaceVariant" size="300" direction="Horizontal" />
              {screenShareFramerateCaps.map((cap) => (
                <MenuItem
                  key={`framerate-${cap}`}
                  size="300"
                  variant="Surface"
                  radii="300"
                  aria-checked={framerate === cap}
                  onClick={() => handleSelect({ framerate_cap: cap })}
                  after={framerate === cap && <Icon size="50" src={Icons.Check} />}
                >
                  <Text size="B300" truncate>
                    {`${cap} fps`}
                  </Text>
                </MenuItem>
              ))}
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <TooltipProvider
        position="Top"
        delay={500}
        tooltip={
          <Tooltip>
            <Text size="T200">Screenshare Quality</Text>
          </Tooltip>
        }
      >
        {(anchorRef) => (
          <IconButton
            ref={anchorRef}
            variant="Surface"
            fill="Soft"
            radii="400"
            size="400"
            onClick={handleOpenMenu}
            outlined
            aria-pressed={!!cords}
          >
            <Icon size="400" src={Icons.ChevronBottom} />
          </IconButton>
        )}
      </TooltipProvider>
    </PopOut>
  );
}

export function ChatButton() {
  const [chat, setChat] = useAtom(callChatAtom);

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{chat ? 'Close Chat' : 'Open Chat'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={chat ? 'Success' : 'Surface'}
          fill="Soft"
          radii="400"
          size="400"
          onClick={() => setChat(!chat)}
          outlined
        >
          <Icon size="400" src={Icons.Message} filled={chat} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}
