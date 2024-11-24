import axios from 'axios';

const pluginname = '[vite-plugin-iconify] ';
/**
 * Parse attributes from the <Icon /> tag.
 * @param {string} attributesString - The string containing the attributes.
 * @returns {object} An object representing the parsed attributes.
 */
function parseAttributes(attributesString) {
  const attributes = {};
  const regex = /([:@]?\w[\w-]*)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(attributesString))) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

/**
 * Build the SVG URL with query parameters.
 * @param {string} prefix - The prefix of the icon (e.g., icon set).
 * @param {string} name - The name of the icon.
 * @param {object} attributes - The attributes from the <Icon /> tag.
 * @returns {string} The URL to fetch the SVG.
 */
function buildSvgUrl(prefix, name, attributes) {
  const baseUrl = `https://api.iconify.design/${prefix}/${name}.svg`;
  const params = new URLSearchParams();
  if (attributes.width) params.set('width', attributes.width);
  if (attributes.height) params.set('height', attributes.height);
  if (attributes.color) params.set('color', attributes.color);
  if (attributes.flip) params.set('flip', attributes.flip);
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Fetch SVG content from the specified URL.
 * @param {string} url - The URL to fetch the SVG from.
 * @returns {Promise<string>} The SVG content as a string.
 */
async function fetchSvg(url) {
  console.log(`${pluginname}fetching svg: ${url}`);
  try {
    const response = await axios.get(url, { responseType: 'text' });
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    return response.data;
  } catch (error) {
    throw new Error(`${pluginname}Failed to fetch SVG: ${error.message}`);
  }
}

export { parseAttributes, buildSvgUrl, fetchSvg };