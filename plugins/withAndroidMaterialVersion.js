const { withProjectBuildGradle } = require('expo/config-plugins');

const MATERIAL_VERSION = '1.12.0';
const START_MARKER = '// @liqi-match/material-version:start';
const END_MARKER = '// @liqi-match/material-version:end';

const materialResolutionBlock = `  ${START_MARKER}
  configurations.configureEach {
    resolutionStrategy.force 'com.google.android.material:material:${MATERIAL_VERSION}'
  }
  ${END_MARKER}`;

function withAndroidMaterialVersion(config) {
  return withProjectBuildGradle(config, (gradleConfig) => {
    let contents = gradleConfig.modResults.contents;

    if (contents.includes(START_MARKER)) {
      contents = contents.replace(
        new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`),
        materialResolutionBlock.trim(),
      );
    } else {
      contents = contents.replace(
        /(allprojects\s*\{\s*repositories\s*\{[\s\S]*?\n\s*\}\n)/,
        `$1\n${materialResolutionBlock}\n`,
      );
    }

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = withAndroidMaterialVersion;
