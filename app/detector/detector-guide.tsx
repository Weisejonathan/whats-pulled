export function DetectorGuide({ mode }: { mode: "camera" | "screen" }) {
  return <>
    <p className="detector-intro">Read the full player name, numbered copy and visible autograph from a card. Check every result before publishing a pull.</p>
    <ol className="detector-steps" aria-label="How to use the detector">
      <li><strong>1. Prepare</strong><p>Select the exact set and year. Wait for the reader to load, then start capture or upload a photo.</p></li>
      <li><strong>2. Capture</strong><p>Keep one complete card inside the focus area. Hold it steady with the name and serial visible and avoid reflections.</p></li>
      <li><strong>3. Review</strong><p>Compare the proof, correct missing details and select the matching catalog card. Enter “Pulled by” to confirm.</p></li>
    </ol>
    <details className="detector-help">
      <summary>Setup, accuracy and saving your results</summary>
      <div className="detector-help-grid">
        <section><h3>{mode === "screen" ? "Screen and livestream" : "Camera and OBS"}</h3><p>{mode === "screen" ? "Open your livestream first. Start capture opens the browser sharing dialog: choose the video tab, window or screen. A source URL alone does not start recognition." : "Allow camera access and select your webcam or OBS Virtual Camera. Start the virtual camera in OBS first, then refresh this page if it is missing."}</p><p>Use desktop Chrome for live capture. Screen sharing depends on your browser and device; on mobile, upload a PNG, JPEG or WebP photo instead.</p></section>
        <section><h3>Speed and image quality</h3><p>The first model download needs an internet connection and can take several seconds. After loading, the target is 1–2 seconds per readable card; device speed, blur and glare can increase this.</p><p>A serial such as 37/50 means copy 37 of 50. It is different from the printed checklist number. Hidden or conflicting details remain unknown.</p></section>
        <section><h3>Autographs and AI review</h3><p>Local autograph detection looks for blue pen-like strokes near a readable certification label. Black ink or unclear cards may need review. This is not an authenticity check.</p><p>Optional AI review sends the captured image to the server and OpenAI and may incur API costs. It can take longer. You can turn it off and correct details yourself.</p></section>
        <section><h3>Saving and OBS overlays</h3><p>Captures are uploaded to your review queue. Unsynced frames stay in this browser for retry; do not clear browser storage before syncing. Capture pauses at eight waiting frames.</p><p>Only confirmed pulls are published. To send them to OBS, copy your session’s overlay key from OBS Studio. A source URL and overlay key are optional.</p><a href="/studio">Open OBS Studio</a></section>
      </div>
    </details>
  </>;
}
