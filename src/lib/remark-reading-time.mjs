/**
 * Injects `minutesRead` and `wordCount` into each post's
 * remarkPluginFrontmatter, read back in the post template. ~200 wpm, min 1.
 * Dependency-free: walks the mdast tree for text nodes.
 */
function collectText(node) {
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) return node.children.map(collectText).join(' ');
  return '';
}

export function remarkReadingTime() {
  return (tree, file) => {
    const words = collectText(tree).split(/\s+/).filter(Boolean).length;
    const data = file.data.astro;
    data.frontmatter.wordCount = words;
    data.frontmatter.minutesRead = Math.max(1, Math.round(words / 200));
  };
}
