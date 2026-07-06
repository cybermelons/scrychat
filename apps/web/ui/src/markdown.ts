// Minimal markdown -> HTML renderer. Supports: headings, bold, italic,
// inline code, code fences, links, unordered/ordered lists, tables,
// paragraphs. Escapes HTML first, so output is safe to inject.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
}

export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const out: string[] = [];
  let i = 0;
  let inCode = false;
  let listTag: "ul" | "ol" | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      flushPara();
      closeList();
      if (!inCode) {
        out.push("<pre><code>");
        inCode = true;
      } else {
        out.push("</code></pre>");
        inCode = false;
      }
      i++;
      continue;
    }
    if (inCode) {
      out.push(line);
      i++;
      continue;
    }

    // table: header row + separator row
    if (
      line.trim().startsWith("|") &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) &&
      lines[i + 1].includes("-")
    ) {
      flushPara();
      closeList();
      const parseRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => inline(c.trim()));
      const headers = parseRow(line);
      out.push('<div class="md-table-wrap"><table><thead><tr>');
      for (const h of headers) out.push(`<th>${h}</th>`);
      out.push("</tr></thead><tbody>");
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        out.push("<tr>");
        for (const c of parseRow(lines[i])) out.push(`<td>${c}</td>`);
        out.push("</tr>");
        i++;
      }
      out.push("</tbody></table></div>");
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      closeList();
      const level = Math.min(heading[1].length + 2, 6);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    const ulItem = /^\s*[-*]\s+(.*)$/.exec(line);
    const olItem = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ulItem || olItem) {
      flushPara();
      const tag = ulItem ? "ul" : "ol";
      if (listTag !== tag) {
        closeList();
        out.push(`<${tag}>`);
        listTag = tag;
      }
      out.push(`<li>${inline((ulItem ?? olItem)![1])}</li>`);
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      closeList();
      i++;
      continue;
    }

    closeList();
    para.push(line.trim());
    i++;
  }

  flushPara();
  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}
