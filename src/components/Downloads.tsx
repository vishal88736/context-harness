import { useEffect, useState } from "react";
import { Download, Laptop, TerminalSquare } from "lucide-react";
import "../downloads.css";

type Artifact = {
  platform: string;
  url: string;
  sha256: string;
  bytes: number;
};
type Release = { version: string | null; artifacts: Artifact[] };
const platforms = [
  ["linux-x64", "Linux", "64-bit Intel / AMD"],
  ["darwin-arm64", "macOS", "Apple silicon"],
  ["darwin-x64", "macOS", "Intel"],
] as const;
export function parseRelease(value: unknown): Release {
  const data = value as Partial<Release>;
  if (
    !data ||
    !Array.isArray(data.artifacts) ||
    data.artifacts.length > 6 ||
    (data.version !== null && !/^v\d+\.\d+\.\d+$/.test(String(data.version)))
  )
    throw new Error("Invalid release metadata.");
  const artifacts = data.artifacts.filter(
    (a) =>
      platforms.some((p) => p[0] === a.platform) &&
      /^\/downloads\/v\d+\.\d+\.\d+\/canopy-(linux-x64|darwin-arm64|darwin-x64)\.tar\.gz$/.test(
        a.url,
      ) &&
      a.url === `/downloads/${data.version}/canopy-${a.platform}.tar.gz` &&
      /^[a-f0-9]{64}$/.test(a.sha256) &&
      Number.isSafeInteger(a.bytes) &&
      a.bytes > 0,
  );
  return { version: data.version ?? null, artifacts };
}
export function Downloads() {
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}downloads/latest.json`, {
      signal: controller.signal,
      cache: "no-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const text = await response.text();
        if (text.length > 16_384) throw new Error();
        setRelease(parseRelease(JSON.parse(text)));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setRelease({ version: null, artifacts: [] });
      });
    return () => controller.abort();
  }, []);
  return (
    <section
      id="download"
      className="home-section home-downloads"
      aria-labelledby="download-title"
    >
      <div className="home-section-heading">
        <span className="home-eyebrow">YOUR PROJECT. YOUR MACHINE.</span>
        <h2 id="download-title">Bring Canopy home.</h2>
        <p>
          Download the local coding workspace. Connect your folders and your
          choice of provider.
        </p>
      </div>
      {release?.version && (
        <p className="home-download-version">
          Latest release · {release.version}
        </p>
      )}
      <div className="home-download-grid">
        {platforms.map(([platform, name, architecture]) => {
          const artifact = release?.artifacts.find(
            (a) => a.platform === platform,
          );
          return (
            <article key={platform}>
              <Laptop size={22} />
              <h3>{name}</h3>
              <p>{architecture}</p>
              {artifact ? (
                <>
                  <a className="home-primary" href={artifact.url} download>
                    <Download size={15} /> Download ·{" "}
                    {Math.ceil(artifact.bytes / 1048576)} MB
                  </a>
                  <details>
                    <summary>Verify checksum</summary>
                    <code>{artifact.sha256}</code>
                  </details>
                </>
              ) : (
                <span className="home-download-pending">
                  {release ? "Package not published yet" : "Checking release…"}
                </span>
              )}
            </article>
          );
        })}
      </div>
      <div className="home-download-guide">
        <TerminalSquare size={19} />
        <p>
          Extract the archive and open <strong>Launch Canopy.command</strong>.
          Canopy opens in your browser and runs on your computer. Your selected
          context is sent to the provider you connect.
        </p>
      </div>
      <a
        className="home-text-link"
        href="https://github.com/vishal88736/context-harness#quick-start"
      >
        Build from source & setup guide →
      </a>
    </section>
  );
}
