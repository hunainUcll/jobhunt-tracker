import { describe, it, expect } from "vitest";
import { cleanEmailBody, extractEmailBody } from "../src/lib/email-body";
const data = (text: string) => Buffer.from(text).toString("base64url");
describe("minimal cleaned email bodies", () => {
  it("removes HTML, scripts, styles and quoted history", () =>
    expect(
      cleanEmailBody(
        "<style>secret styles</style><script>secret</script><p>Interview &amp; role</p><blockquote>private history</blockquote>",
      ),
    ).toBe("Interview & role"));
  it("omits plaintext reply history", () =>
    expect(
      cleanEmailBody(
        "Current message\n\nOn Wed, Someone wrote:\nOld private message",
      ),
    ).toBe("Current message"));
  it("omits forwarded history", () =>
    expect(
      cleanEmailBody("New content\n-----Original Message-----\nUnrelated"),
    ).toBe("New content"));
  it("omits quote-prefixed lines", () =>
    expect(cleanEmailBody("Current\n> Unrelated quoted email")).toBe(
      "Current",
    ));
  it("prefers plain text over the HTML alternative", () =>
    expect(
      extractEmailBody({
        parts: [
          { mimeType: "text/plain", body: { data: data("Plain") } },
          { mimeType: "text/html", body: { data: data("<p>Alternative</p>") } },
        ],
      }),
    ).toBe("Plain"));
  it("never decodes attachments or embedded email messages", () =>
    expect(
      extractEmailBody(
        {
          parts: [
            {
              mimeType: "text/plain",
              filename: "private.txt",
              body: { data: data("private attachment") },
            },
            {
              mimeType: "message/rfc822",
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: data("unrelated attached email") },
                },
              ],
            },
          ],
        },
        "Fallback snippet",
      ),
    ).toBe("Fallback snippet"));
  it("limits body size", () =>
    expect(cleanEmailBody("a".repeat(15000))).toHaveLength(12000));
  it("decodes numeric entities safely", () =>
    expect(cleanEmailBody("Data &#38; AI &#x26; role")).toBe(
      "Data & AI & role",
    ));
});
