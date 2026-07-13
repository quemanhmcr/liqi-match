#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const prettier = require('prettier');
const { readImageMetadata } = require('./lib/image-metadata.cjs');

const output = 'assets/simulation/asset-manifest.v1.json';
const moduleOutput =
  'src/entities/media-asset/data/generated-bundled-modules.ts';
const bundled = (
  key,
  kind,
  altText,
  ownerKind,
  ownerId,
  sourcePath,
  usage = 'golden-world',
  simulationState = 'available',
) => ({
  altText,
  key,
  kind,
  ownerId,
  ownerKind,
  simulationState,
  source: { path: sourcePath, type: 'bundled' },
  usage,
});
const placeholder = (key, kind, altText, ownerKind, ownerId, variant) => ({
  altText,
  format: 'webp',
  height: 512,
  key,
  kind,
  ownerId,
  ownerKind,
  simulationState: 'available',
  source: { type: 'placeholder', variant },
  usage: 'golden-world',
  width: 512,
});

const entries = [
  placeholder(
    'asset:shared:avatar-fallback',
    'shared-fallback',
    'Ảnh đại diện mặc định',
    'shared',
    'shared:avatar-fallback',
    'avatar-neutral',
  ),
  bundled(
    'asset:profile:an-mage:avatar',
    'avatar',
    'Ảnh đại diện An Mage',
    'profile',
    'profile:an-mage',
    'assets/simulation/golden-world/avatars/lavender-mage.webp',
  ),
  bundled(
    'asset:profile:duc-flex:avatar',
    'avatar',
    'Ảnh đại diện Đức Flex',
    'profile',
    'profile:duc-flex',
    'assets/simulation/golden-world/avatars/silver-assassin.webp',
  ),
  bundled(
    'asset:profile:huy-captain:avatar',
    'avatar',
    'Ảnh đại diện Huy Captain',
    'profile',
    'profile:huy-captain',
    'assets/simulation/golden-world/avatars/dark-fighter.webp',
  ),
  bundled(
    'asset:profile:khoa-jungle:avatar',
    'avatar',
    'Ảnh đại diện Khoa Jungle',
    'profile',
    'profile:khoa-jungle',
    'assets/simulation/golden-world/avatars/khoa-jungle.webp',
  ),
  bundled(
    'asset:profile:linh-mid:avatar',
    'avatar',
    'Ảnh đại diện Linh Mid',
    'profile',
    'profile:linh-mid',
    'assets/simulation/golden-world/avatars/cyber-girl.webp',
  ),
  bundled(
    'asset:profile:minh-anh:avatar',
    'avatar',
    'Ảnh đại diện Minh Anh',
    'profile',
    'profile:minh-anh',
    'assets/simulation/golden-world/avatars/minh-anh.webp',
  ),
  bundled(
    'asset:profile:nam-slayer:avatar',
    'avatar',
    'Ảnh đại diện Nam Slayer',
    'profile',
    'profile:nam-slayer',
    'assets/simulation/golden-world/avatars/ice-prince.webp',
  ),
  bundled(
    'asset:profile:phuc-jungle:avatar',
    'avatar',
    'Ảnh đại diện Phúc Jungle',
    'profile',
    'profile:phuc-jungle',
    'assets/simulation/golden-world/avatars/phuc-jungle.webp',
  ),
  bundled(
    'asset:profile:quan-viewer:avatar',
    'avatar',
    'Ảnh đại diện Quân',
    'profile',
    'profile:quan-viewer',
    'assets/simulation/golden-world/avatars/cozy-gamer.webp',
  ),
  bundled(
    'asset:profile:trang-carry:avatar',
    'avatar',
    'Ảnh đại diện Trang Carry',
    'profile',
    'profile:trang-carry',
    'assets/simulation/golden-world/avatars/pink-support.webp',
  ),
  bundled(
    'asset:profile:vy-carry:avatar',
    'avatar',
    'Ảnh đại diện Vy Carry',
    'profile',
    'profile:vy-carry',
    'assets/simulation/golden-world/avatars/pink-carry.webp',
  ),
  bundled(
    'asset:profile:quan-viewer:cover',
    'cover',
    'Ảnh bìa của Quân',
    'profile',
    'profile:quan-viewer',
    'assets/simulation/golden-world/covers/quan-viewer.webp',
  ),
  bundled(
    'asset:profile:minh-anh:cover',
    'cover',
    'Ảnh bìa của Minh Anh',
    'profile',
    'profile:minh-anh',
    'assets/simulation/golden-world/covers/minh-anh.webp',
  ),
  bundled(
    'asset:profile:khoa-jungle:cover',
    'cover',
    'Ảnh bìa của Khoa Jungle',
    'profile',
    'profile:khoa-jungle',
    'assets/simulation/golden-world/covers/khoa-jungle.webp',
  ),
  bundled(
    'asset:profile:quan-viewer:wall:0',
    'wall',
    'Khoảnh khắc rank của Quân',
    'profile',
    'profile:quan-viewer',
    'assets/simulation/golden-world/walls/quan-viewer-rank.webp',
  ),
  bundled(
    'asset:profile:quan-viewer:wall:1',
    'wall',
    'Ảnh đội hình của Quân',
    'profile',
    'profile:quan-viewer',
    'assets/simulation/golden-world/walls/quan-viewer-team.webp',
  ),
  bundled(
    'asset:profile:quan-viewer:cover-pending',
    'cover',
    'Ảnh bìa đã upload nhưng chưa associate của Quân',
    'profile',
    'profile:quan-viewer',
    'assets/simulation/golden-world/covers/quan-viewer-pending.webp',
    'scenario',
    'unassociated',
  ),
  bundled(
    'asset:set:dem-violet:artwork',
    'set-artwork',
    'Artwork set Đêm Violet',
    'set',
    'set:dem-violet',
    'assets/simulation/golden-world/artwork/set-dem-violet.webp',
  ),
  bundled(
    'asset:set:sao-bang:artwork',
    'set-artwork',
    'Artwork Team Sao Băng',
    'set',
    'set:sao-bang',
    'assets/simulation/golden-world/artwork/set-team-sao-bang.webp',
  ),
  bundled(
    'asset:set:macro-lab:artwork',
    'set-artwork',
    'Artwork Macro Lab',
    'set',
    'set:macro-lab',
    'assets/simulation/golden-world/artwork/set-duo-jungle-support.webp',
  ),
  bundled(
    'asset:vibe:rank:artwork',
    'vibe-artwork',
    'Không khí leo rank',
    'shared',
    'shared:vibe-rank',
    'assets/simulation/golden-world/artwork/vibe-late-night-rank.webp',
  ),
  bundled(
    'asset:vibe:social:artwork',
    'vibe-artwork',
    'Không khí duo xã hội',
    'shared',
    'shared:vibe-social',
    'assets/simulation/golden-world/artwork/vibe-duo-support.webp',
  ),
  bundled(
    'asset:vibe:team:artwork',
    'vibe-artwork',
    'Không khí tuyển team',
    'shared',
    'shared:vibe-team',
    'assets/simulation/golden-world/artwork/vibe-team-needs-mid.webp',
  ),
  bundled(
    'asset:message:victory-photo',
    'message-image',
    'Ảnh combat cuối trận',
    'message',
    'message:vy-carry:1',
    'assets/simulation/golden-world/messages/victory-photo.webp',
  ),
  bundled(
    'asset:message:lobby-screenshot',
    'message-image',
    'Ảnh lobby chờ team',
    'shared',
    'shared:unused-message-preview',
    'assets/simulation/golden-world/messages/lobby-screenshot.webp',
  ),
  bundled(
    'asset:message:build-aya',
    'build-preview',
    'Build Aya support',
    'message',
    'message:minh-anh:5',
    'assets/anh_mau2/heroes/aya.webp',
  ),
  bundled(
    'asset:shared:role-support',
    'role-icon',
    'Biểu tượng Trợ Thủ',
    'shared',
    'shared:role-support',
    'assets/anh_mau2/lane-icons/support.png',
  ),
  bundled(
    'asset:shared:legacy-build-nakroth',
    'build-preview',
    'Build Nakroth dùng trong fixture cũ',
    'shared',
    'shared:legacy-build-nakroth',
    'assets/anh_mau2/heroes/nakroth.webp',
    'legacy-library',
  ),
  bundled(
    'asset:shared:legacy-role-jungle',
    'role-icon',
    'Biểu tượng Đi Rừng dùng trong fixture cũ',
    'shared',
    'shared:legacy-role-jungle',
    'assets/anh_mau2/lane-icons/jungle.png',
    'legacy-library',
  ),
].map((entry) => {
  if (entry.source.type !== 'bundled') return entry;
  const bytes = fs.readFileSync(entry.source.path);
  const metadata = readImageMetadata(entry.source.path);
  return {
    ...entry,
    byteSize: bytes.length,
    format: metadata.format,
    height: metadata.height,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    source: {
      path: entry.source.path.split(path.sep).join('/'),
      type: 'bundled',
    },
    width: metadata.width,
  };
});

const manifest = {
  budgets: {
    maxBytesByKind: {
      avatar: 400000,
      'build-preview': 50000,
      cover: 350000,
      'message-image': 250000,
      'message-video': 5000000,
      'role-icon': 400000,
      'set-artwork': 350000,
      'shared-fallback': 0,
      'vibe-artwork': 350000,
      wall: 250000,
    },
    maxTotalBundledBytes: 6000000,
  },
  entries,
  generatedAt: '2026-07-13T07:25:00.000Z',
  version: 1,
};

const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const moduleLines = entries
  .filter((entry) => entry.source.type === 'bundled')
  .map(
    (entry) =>
      `  ${JSON.stringify(entry.key)}: require(${JSON.stringify(
        `../../../../${entry.source.path}`,
      )}) as number,`,
  );
const moduleText = [
  '// Generated by scripts/generate-asset-manifest.cjs. Do not edit manually.',
  'export const bundledModuleByAssetKey = {',
  ...moduleLines,
  '} as const;',
  '',
].join('\n');

finalizeGeneratedFiles().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function finalizeGeneratedFiles() {
  const [manifestConfig, moduleConfig] = await Promise.all([
    prettier.resolveConfig(output),
    prettier.resolveConfig(moduleOutput),
  ]);
  const [formattedManifest, formattedModule] = await Promise.all([
    prettier.format(manifestText, {
      ...manifestConfig,
      filepath: output,
    }),
    prettier.format(moduleText, {
      ...moduleConfig,
      filepath: moduleOutput,
    }),
  ]);

  if (process.argv.includes('--check')) {
    checkGeneratedFile(output, formattedManifest);
    checkGeneratedFile(moduleOutput, formattedModule);
    console.log(
      `Asset generated files are current: ${entries.length} manifest entries.`,
    );
    return;
  }

  fs.writeFileSync(output, formattedManifest);
  fs.writeFileSync(moduleOutput, formattedModule);
  console.log(
    `Generated ${output} and ${moduleOutput} with ${entries.length} entries.`,
  );
}

function checkGeneratedFile(filePath, expected) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Generated asset file is missing: ${filePath}`);
  }
  const actual = fs.readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n');
  if (actual !== expected) {
    throw new Error(
      `Generated asset file is stale: ${filePath}. Run npm run assets:generate.`,
    );
  }
}
