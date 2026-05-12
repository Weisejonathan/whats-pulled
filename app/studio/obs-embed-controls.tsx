"use client";

import { useMemo, useState } from "react";

type ObsEmbedControlsProps = {
  apiEndpointUrl: string;
  overlayUrl: string;
};

const overlayModes = [
  { label: "Last Pull + Comp", mode: "last" },
  { label: "Set Preview", mode: "preview" },
  { label: "Sales Comp", mode: "comp" },
];

export function ObsEmbedControls({ apiEndpointUrl, overlayUrl }: ObsEmbedControlsProps) {
  const [mode, setMode] = useState("last");
  const [copied, setCopied] = useState("");
  const obsUrl = useMemo(() => `${overlayUrl}?mode=${mode}&obs=1`, [mode, overlayUrl]);
  const testUrl = useMemo(() => `${overlayUrl}?mode=${mode}&controls=1`, [mode, overlayUrl]);

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  };

  return (
    <div className="obs-embed-app">
      <div className="obs-embed-toolbar">
        {overlayModes.map((item) => (
          <button
            className={mode === item.mode ? "active" : ""}
            key={item.mode}
            type="button"
            onClick={() => setMode(item.mode)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="obs-source-card">
        <span>OBS Browser Source URL</span>
        <code>{obsUrl}</code>
        <div className="obs-source-actions">
          <button type="button" onClick={() => copyText(obsUrl, "OBS URL copied")}>
            Copy OBS URL
          </button>
          <button type="button" onClick={() => window.open(testUrl, "_blank", "noopener,noreferrer")}>
            Open Test Player
          </button>
        </div>
      </div>

      <div className="obs-source-card compact">
        <span>Detector POST Endpoint</span>
        <code>{apiEndpointUrl}</code>
        <button type="button" onClick={() => copyText(apiEndpointUrl, "Endpoint copied")}>
          Copy Endpoint
        </button>
      </div>

      <div className="obs-preview-frame">
        <iframe src={testUrl} title="OBS overlay preview" />
      </div>

      <div className="obs-settings-grid">
        <div>
          <span>Width</span>
          <strong>1920</strong>
        </div>
        <div>
          <span>Height</span>
          <strong>1080</strong>
        </div>
        <div>
          <span>FPS</span>
          <strong>30</strong>
        </div>
        <div>
          <span>CSS</span>
          <strong>Transparent</strong>
        </div>
      </div>

      {copied ? <p className="obs-copy-status">{copied}</p> : null}
    </div>
  );
}
