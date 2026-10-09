import { afterEach, describe, it, expect, vi } from "vitest";
import { createServer, type Server, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import {
  DEFAULT_AI_CONFIG,
  localAiSettingsSchema,
  validateOllamaUrl,
} from "../src/lib/ai-config";
import {
  classifyWithOllama,
  classifyForSync,
  localRequest,
  verifyLocalModel,
} from "../src/lib/local-ai";
const config = { ...DEFAULT_AI_CONFIG, enabled: true };
const mail = {
  sender: "Sarah <sarah@acme.example>",
  subject: "An update",
  snippet: "We would like to meet.",
};
const result = {
  isJobRelated: true,
  company: "Acme",
  role: "Data Internship",
  status: "INTERVIEW",
  confidence: 0.92,
  reason: "The sender requests a recruiting meeting.",
};
const localModel = {
  model_info: { "general.architecture": "qwen2" },
  capabilities: ["completion"],
};
function transport(content: unknown = result) {
  return vi
    .fn()
    .mockResolvedValueOnce(localModel)
    .mockResolvedValueOnce({
      message: {
        content:
          typeof content === "string" ? content : JSON.stringify(content),
      },
      done: true,
    });
}
describe("Ollama classification", () => {
  it("validates successful structured output and sends only minimal cleaned email data", async () => {
    const send = transport();
    const classified = await classifyWithOllama(
      {
        ...mail,
        body: "<p>Let us meet &amp; discuss the role.</p><blockquote>Unrelated personal history</blockquote>\nOn Tuesday, someone wrote:\nsecret",
      },
      config,
      send,
    );
    expect(classified).toEqual(result);
    expect(send.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/show");
    const request = send.mock.calls[1][1];
    expect(request.model).toBe("qwen2.5:3b");
    expect(request.stream).toBe(false);
    expect(request.format.required).toEqual(
      expect.arrayContaining([
        "isJobRelated",
        "company",
        "role",
        "status",
        "confidence",
        "reason",
      ]),
    );
    expect(request.messages).toHaveLength(2);
    const payload = JSON.parse(request.messages[1].content);
    expect(Object.keys(payload).sort()).toEqual(["body", "sender", "subject"]);
    expect(payload.body).toBe("Let us meet & discuss the role.");
    expect(JSON.stringify(request)).not.toContain("Unrelated personal history");
    expect(JSON.stringify(request)).not.toContain("secret");
    expect(request.tools).toBeUndefined();
  });
  it("rejects malformed classification JSON", async () =>
    expect(
      classifyWithOllama(
        { ...mail, body: "Update" },
        config,
        transport("{no valid json"),
      ),
    ).rejects.toThrow("malformed classification JSON"));
  it.each([
    { ...result, confidence: "0.9" },
    { ...result, status: "SENT_EMAIL" },
    { ...result, confidence: 1.5 },
    { ...result, extra: "unexpected" },
    { ...result, isJobRelated: false },
  ])("rejects output that does not satisfy the schema", async (invalid) =>
    expect(
      classifyWithOllama(
        { ...mail, body: "Update" },
        config,
        transport(invalid),
      ),
    ).rejects.toThrow("required schema"),
  );
  it("marks low-confidence results Needs Review", async () => {
    const classified = await classifyForSync(
      mail,
      config,
      async () => "Meet?",
      transport({ ...result, confidence: 0.69 }),
    );
    expect(classified).toMatchObject({
      source: "OLLAMA",
      needsReview: true,
      result: { confidence: 0.69 },
    });
  });
  it("allows a suggestion at exactly the threshold", async () =>
    expect(
      await classifyForSync(
        mail,
        config,
        async () => "Meet?",
        transport({ ...result, confidence: 0.7 }),
      ),
    ).toMatchObject({ source: "OLLAMA", needsReview: false }));
  it("uses a stricter user threshold", async () =>
    expect(
      await classifyForSync(
        mail,
        { ...config, confidenceThreshold: 0.95 },
        async () => "Meet?",
        transport(),
      ),
    ).toMatchObject({ needsReview: true }));
  it("runs strong deterministic rules first without fetching body or calling Ollama", async () => {
    const send = vi.fn();
    const load = vi.fn();
    expect(
      await classifyForSync(
        { ...mail, subject: "Thank you for applying" },
        config,
        load,
        send,
      ),
    ).toMatchObject({
      source: "RULES",
      needsReview: false,
      result: { status: "APPLICATION_CONFIRMATION" },
    });
    expect(send).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
  it("calls Ollama for a weak rule even when not UNKNOWN", async () => {
    const send = transport();
    expect(
      await classifyForSync(
        { ...mail, subject: "Unfortunately" },
        config,
        async () => "Unfortunately, your delivery is delayed.",
        send,
      ),
    ).toMatchObject({ source: "OLLAMA" });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("does not call Ollama or fetch a full body when disabled", async () => {
    const send = vi.fn();
    const load = vi.fn();
    expect(
      await classifyForSync(mail, { ...config, enabled: false }, load, send),
    ).toMatchObject({
      source: "RULES",
      needsReview: true,
      result: { status: "UNKNOWN" },
    });
    expect(send).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
  it("falls back gracefully when Ollama is unavailable", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Ollama unavailable."));
    expect(
      await classifyForSync(mail, config, async () => "Update", send),
    ).toMatchObject({
      source: "RULES",
      needsReview: true,
      warning: "Ollama unavailable.",
      result: { status: "UNKNOWN" },
    });
  });
  it("falls back gracefully on malformed JSON", async () =>
    expect(
      await classifyForSync(
        mail,
        config,
        async () => "Update",
        transport("not json"),
      ),
    ).toMatchObject({
      source: "RULES",
      needsReview: true,
      warning: expect.stringContaining("malformed"),
    }));
  it("handles full-body retrieval failure without breaking sync", async () =>
    expect(
      await classifyForSync(
        mail,
        config,
        async () => {
          throw new Error("Gmail body unavailable");
        },
        vi.fn(),
      ),
    ).toMatchObject({
      source: "RULES",
      needsReview: true,
      warning: expect.stringContaining("Rules remain available"),
    }));
  it("allows confident non-job results without status suggestions", async () =>
    expect(
      await classifyForSync(
        mail,
        config,
        async () => "Your delivery",
        transport({
          ...result,
          isJobRelated: false,
          status: "UNKNOWN",
          company: null,
          role: null,
        }),
      ),
    ).toMatchObject({ result: { isJobRelated: false, status: "UNKNOWN" } }));
  it("refuses cloud-backed model aliases before sending email", async () => {
    const send = vi.fn().mockResolvedValue({
      ...localModel,
      remote_host: "https://ollama.com",
      remote_model: "remote",
    });
    await expect(
      classifyWithOllama({ ...mail, body: "PRIVATE EMAIL" }, config, send),
    ).rejects.toThrow("Cloud-backed");
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(send.mock.calls)).not.toContain("PRIVATE EMAIL");
  });
  it("refuses an unverified model before sending email", async () => {
    const send = vi.fn().mockResolvedValue({ model_info: {} });
    await expect(
      classifyWithOllama({ ...mail, body: "PRIVATE EMAIL" }, config, send),
    ).rejects.toThrow("Could not verify");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
describe("local AI settings privacy", () => {
  it.each([
    "https://ollama.com",
    "http://example.org:11434",
    "http://192.168.1.5:11434",
    "http://localhost.evil.example",
    "http://user:pass@localhost:11434",
    "http://localhost:11434/proxy",
    "http://localhost:11434?target=cloud",
    "http://localhost:11434#cloud",
  ])("rejects non-local or ambiguous URL %s", (url) =>
    expect(() => validateOllamaUrl(url)).toThrow(),
  );
  it.each([
    "http://localhost:11434",
    "http://127.0.0.1:11434",
    "http://[::1]:11434",
  ])("accepts literal loopback URL %s", (url) =>
    expect(() => validateOllamaUrl(url)).not.toThrow(),
  );
  it("pins localhost to literal IPv4 loopback", () =>
    expect(validateOllamaUrl("http://localhost:11434")).toBe(
      "http://127.0.0.1:11434",
    ));
  it("enforces the hard 0.70 floor", () =>
    expect(
      localAiSettingsSchema.safeParse({ ...config, confidenceThreshold: 0.69 })
        .success,
    ).toBe(false));
  it("blocks cloud model names", () =>
    expect(
      localAiSettingsSchema.safeParse({ ...config, model: "qwen:cloud" })
        .success,
    ).toBe(false));
});
describe("real loopback HTTP transport", () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });
  async function start(handler: RequestListener) {
    server = createServer(handler);
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  it("classifies through a local mock Ollama server with no cloud calls", async () => {
    const endpoints: string[] = [];
    const url = await start((req, res) => {
      endpoints.push(req.url || "");
      req.resume();
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          req.url === "/api/show"
            ? localModel
            : { message: { content: JSON.stringify(result) }, done: true },
        ),
      );
    });
    expect(
      await classifyWithOllama(
        { ...mail, body: "Current message" },
        { ...config, url },
      ),
    ).toEqual(result);
    expect(endpoints).toEqual(["/api/show", "/api/chat"]);
  });
  it("does not follow redirects", async () => {
    const url = await start((req, res) => {
      req.resume();
      res.writeHead(302, { Location: "https://external.example" });
      res.end();
    });
    await expect(verifyLocalModel({ ...config, url })).rejects.toThrow(
      "Redirects are not allowed",
    );
  });
  it("times out safely", async () => {
    const url = await start((req) => req.resume());
    await expect(
      localRequest(`${url}/api/show`, { model: config.model }, 50),
    ).rejects.toThrow("timed out");
  });
  it("reports an unavailable local server", async () => {
    const url = await start((_req, res) => res.end());
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    await expect(verifyLocalModel({ ...config, url })).rejects.toThrow(
      "Ollama unavailable",
    );
  });
});
