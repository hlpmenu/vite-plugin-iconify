import { createFilter } from '@rollup/pluginutils';
import type { Plugin } from 'vite';
import { parseAttributes, buildSvgUrl, fetchSvg } from './utils';
import transformReact from './transform_react';

const pluginName = '[vite-plugin-iconify] ';

/**
 * A Vite plugin for dynamically inlining Iconify icons in Vue SFCs.
 * @returns {import('vite').Plugin} The Vite plugin instance.
 */
export default function IconifySfcPlugin(): Plugin {
  const filter = createFilter(['**/*.vue']);
  const reactFilter = createFilter(['**/*.jsx', '**/*.tsx']);

  return {
    name: 'vite-plugin-iconify',
    enforce: 'pre', // Ensure this plugin runs before the Vue plugin

    /**
     * Transform function for processing Vue SFCs before they are compiled by Vue.
     * @param {string} code - The source code of the module.
     * @param {string} id - The identifier of the module.
     * @returns {Promise<string|void>} The transformed code or void if no transformation is needed.
     */
    async transform(code: string, id: string): Promise<string | void> {
      if (!reactFilter(id)) {
        return transformReact(code, id);
      }
      if (!filter(id)) return;

      const iconRegex = /<Icon\s+([^>]*?)\/>/g;
      const matches = [...code.matchAll(iconRegex)];
      if (!matches.length) return;

      let transformedCode = code;

      for (const match of matches) {
        const fullMatch = match[0];
        const attributes = parseAttributes(match[1]);

        if (!attributes.icon) {
          console.warn(`${pluginName}Missing 'icon' attribute in <Icon />.`);
          continue;
        }

        const [prefix, name] = attributes.icon.split(':');
        if (!prefix || !name) {
          console.warn(`${pluginName}Invalid 'icon' format in <Icon />: "${attributes.icon}".`);
          continue;
        }

        const svgUrl = buildSvgUrl(prefix, name, attributes);
        const svgContent = await fetchSvg(svgUrl);

        if (!svgContent) {
          console.warn(`${pluginName}Failed to fetch SVG for "${attributes.icon}".`);
          continue;
        }

        // Insert original attributes (except the icon-specific ones) into the <svg> tag
        const filteredAttributes = Object.entries(attributes)
          .filter(([key]) =>
            !['icon', 'width', 'height', 'color', 'flip'].includes(key),
          )
          .map(([key, value]) => `${key}="${value ?? ''}"`)
          .join(' ');

        const svg = svgContent.replace('<svg', `<svg ${filteredAttributes}`);
        transformedCode = transformedCode.replace(fullMatch, svg);
      }

      return transformedCode;
    },
  };
}
