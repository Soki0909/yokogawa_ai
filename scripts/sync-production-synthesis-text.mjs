import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProductionVoiceProfile } from '../src/voice-profile.js';

const manifestPath = path.resolve('config', 'production-speech', 'yokogawa-ai-v1.json');

export function deriveProductionSynthesisText(scriptId, scriptText, policy) {
  if (policy?.id !== 'yokogawa-ai-final-v1' || policy.internalFullStopSuffix !== '…') throw new Error('Unsupported production synthesis text policy.');
  let result = scriptText;
  for (const replacement of policy.globalReplacements ?? []) result = result.replaceAll(replacement.from, replacement.to);
  for (const override of policy.scriptOverrides?.[scriptId] ?? []) {
    if (!result.includes(override.from)) throw new Error(`#${scriptId}: synthesis override source not found: ${override.from}`);
    result = result.replaceAll(override.from, override.to);
  }
  return result.replace(/。(?=.)/gu, `。${policy.internalFullStopSuffix}`);
}

export async function syncProductionSynthesisText() {
  const [profile, source] = await Promise.all([loadProductionVoiceProfile(), readFile(manifestPath, 'utf8')]);
  const manifest = JSON.parse(source);
  for (const speech of manifest.speeches) {
    speech.synthesisText = deriveProductionSynthesisText(speech.scriptId, speech.scriptText, profile.synthesisTextPolicy);
    speech.profileHash = profile.source.sha256;
  }
  manifest.profileHash = profile.source.sha256;
  manifest.synthesisTextPolicy = profile.synthesisTextPolicy;
  manifest.status = 'prepared-for-regeneration';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await syncProductionSynthesisText();
  console.log(`Production synthesis text synced: ${manifest.speeches.length}/18`);
}
