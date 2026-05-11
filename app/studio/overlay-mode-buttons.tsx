"use client";

type OverlayModeButtonsProps = {
  overlayUrl: string;
};

const overlayModes = [
  { label: "Play Last Pull", mode: "last" },
  { label: "Play Set Preview", mode: "preview" },
  { label: "Play Comp", mode: "comp" },
];

export function OverlayModeButtons({ overlayUrl }: OverlayModeButtonsProps) {
  const openOverlay = (mode: string) => {
    window.open(`${overlayUrl}?mode=${mode}&controls=1`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="overlay-mode-buttons">
      {overlayModes.map((item) => (
        <button key={item.mode} type="button" onClick={() => openOverlay(item.mode)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
