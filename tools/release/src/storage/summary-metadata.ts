import { optional, required, writeText } from "./common.ts";
import { releaseChannelDescriptor } from "@open-design/release";

const releaseDescriptor = releaseChannelDescriptor(required("RELEASE_CHANNEL"));
const releaseChannel = releaseDescriptor.channel;
const metadataUrl = required("RELEASE_METADATA_URL");
const summaryPath = required("RELEASE_SUMMARY_PATH");
const cacheBuster = optional("RELEASE_CACHE_BUSTER", "local");

function versionFromMetadata(metadata: Record<string, unknown>): string {
  const value = metadata[releaseDescriptor.releaseVersionField];
  return typeof value === "string" ? value : "";
}

const response = await fetch(`${metadataUrl}${metadataUrl.includes("?") ? "&" : "?"}run=${cacheBuster}`, {
  headers: { "Cache-Control": "no-cache" },
});
if (!response.ok) {
  throw new Error(`metadata fetch failed with HTTP ${response.status}`);
}

const metadata = await response.json() as {
  readyTargets?: string[];
  releaseState?: string;
  r2?: { versionMetadataUrl?: string };
};

writeText(summaryPath, [
  `## ${releaseChannel[0]?.toUpperCase() ?? ""}${releaseChannel.slice(1)} release metadata`,
  "",
  `- version: \`${versionFromMetadata(metadata as Record<string, unknown>)}\``,
  `- state: \`${metadata.releaseState ?? ""}\``,
  `- ready targets: \`${(metadata.readyTargets ?? []).join(", ")}\``,
  `- metadata: ${metadata.r2?.versionMetadataUrl ?? metadataUrl}`,
].join("\n"));

console.log(`wrote ${releaseChannel} release summary to ${summaryPath}`);
