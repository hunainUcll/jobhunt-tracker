const MAX_BODY = 12000;
export function cleanEmailBody(value: string) {
  const unquoted = value
    .slice(0, 100000)
    .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, "")
    .replace(/<\/?(?:p|div|br|li|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/gi,
      (_, name: string) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[
          name.toLowerCase()
        ] || "",
    )
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, number: string) => {
      const n =
        number[0].toLowerCase() === "x"
          ? parseInt(number.slice(1), 16)
          : parseInt(number, 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  const lines: string[] = [];
  for (const line of unquoted.split("\n")) {
    if (
      /^\s*(?:On .{0,500}wrote:|-{2,}\s*(?:Original Message|Forwarded message)|Begin forwarded message:|From:\s.+@)/i.test(
        line,
      )
    )
      break;
    if (/^\s*>/.test(line)) continue;
    lines.push(line.trimEnd());
  }
  return lines
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_BODY);
}
export type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPart[];
};
export function extractEmailBody(payload?: GmailPart, fallback = ""): string {
  const plain: string[] = [],
    html: string[] = [];
  function visit(part: GmailPart) {
    if (
      part.filename ||
      part.body?.attachmentId ||
      part.mimeType === "message/rfc822"
    )
      return;
    if (part.body?.data && part.body.data.length < 500000) {
      const decoded = Buffer.from(part.body.data, "base64url").toString("utf8");
      if (part.mimeType === "text/plain") plain.push(decoded);
      else if (part.mimeType === "text/html") html.push(decoded);
    }
    part.parts?.forEach(visit);
  }
  if (payload) visit(payload);
  return cleanEmailBody(
    plain.length ? plain.join("\n") : html.length ? html.join("\n") : fallback,
  );
}
