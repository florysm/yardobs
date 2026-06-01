// Parses Keep a Changelog markdown into structured data.
// Returns: [{ version, date, sections: [{ heading, items: string[] }] }]
export function parseChangelog(raw) {
  const releases = [];
  const versionBlocks = raw.split(/^## /m).slice(1);

  for (const block of versionBlocks) {
    const lines = block.split('\n');
    const header = lines[0].trim();
    const match = header.match(/^\[?([^\]]+)\]?\s*(?:-\s*(.+))?$/);
    if (!match) continue;

    const version = match[1].trim();
    const date = match[2]?.trim() ?? '';
    const sections = [];
    let currentSection = null;

    for (const line of lines.slice(1)) {
      const sectionMatch = line.match(/^### (.+)/);
      if (sectionMatch) {
        currentSection = { heading: sectionMatch[1].trim(), items: [] };
        sections.push(currentSection);
        continue;
      }
      const itemMatch = line.match(/^- (.+)/);
      if (itemMatch && currentSection) {
        currentSection.items.push(itemMatch[1].trim());
      } else if (itemMatch && sections.length === 0) {
        // Bullet with no section header — treat as ungrouped
        if (!currentSection) {
          currentSection = { heading: '', items: [] };
          sections.push(currentSection);
        }
        currentSection.items.push(itemMatch[1].trim());
      }
    }

    releases.push({ version, date, sections });
  }

  return releases;
}
