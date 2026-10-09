import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
const db = new PrismaClient({ datasources: { db: { url: "file:./e2e.db" } } });
const company = `Browser Test ${Date.now()}`;
test.afterAll(async () => {
  const companies = await db.company.findMany({
    where: { name: { startsWith: "Browser Test " } },
  });
  for (const c of companies) {
    const apps = await db.application.findMany({ where: { companyId: c.id } });
    await db.activity.deleteMany({
      where: { applicationId: { in: apps.map((a) => a.id) } },
    });
    await db.application.deleteMany({ where: { companyId: c.id } });
    await db.emailThread.deleteMany({
      where: { gmailThreadId: { startsWith: "ai-browser-test-" } },
    });
    await db.company.delete({ where: { id: c.id } });
  }
  await db.$disconnect();
});
test("renders every workspace page and persists dark mode", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /keep things moving/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Needs attention" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-light.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: "test-results/dashboard-dark.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "Light mode", exact: true }).click();
  for (const [url, title] of [
    ["/applications", "Applications"],
    ["/contacts", "Contacts"],
    ["/inbox", "Job inbox"],
    ["/follow-ups", "Follow-ups"],
    ["/settings", "Settings"],
  ]) {
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Connect Gmail · read-only" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
test("filters applications and opens the Kanban view", async ({ page }) => {
  await page.goto("/applications");
  await page
    .getByRole("textbox", { name: "Search applications" })
    .fill("Proximus");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search applications" }).fill("");
  await page
    .getByRole("combobox", { name: "Filter status" })
    .selectOption("Interview");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Filter status" }).selectOption("");
  await page.getByRole("button", { name: "Kanban view" }).click();
  await expect(
    page.getByText("Technology Consulting Internship", { exact: true }),
  ).toBeVisible();
});
test("creates, edits and rejects a duplicate application through server actions", async ({
  page,
}) => {
  await page.goto("/applications/new");
  await page.getByLabel("Company *", { exact: true }).fill(company);
  await page.getByLabel("Job title / opportunity *").fill("Test Internship");
  await page
    .getByLabel("Status", { exact: true })
    .selectOption("Awaiting reply");
  await page.getByLabel("Applied / first outreach").fill("2026-10-01");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\/applications\/[a-z0-9]+$/);
  await expect(
    page.getByRole("heading", { name: company, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Edit application" }).click();
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Browser-tested persistence");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page.getByText("Browser-tested persistence")).toBeVisible();
  await page.goto("/applications/new");
  await page.getByLabel("Company *", { exact: true }).fill(company);
  await page.getByLabel("Job title / opportunity *").fill("Test Internship");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(
    page.getByText(
      "This application already exists. Open the existing entry instead.",
    ),
  ).toBeVisible();
});
test("CSV round-trip skips duplicates and blocks cross-origin writes", async ({
  page,
  request,
}) => {
  const exported = await request.get("/api/csv");
  expect(exported.ok()).toBe(true);
  const csv = await exported.body();
  expect(csv.toString()).toContain("company,jobTitle");
  await page.goto("/applications");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("dialog").locator("input[type=file]").setInputFiles({
    name: "round-trip.csv",
    mimeType: "text/csv",
    buffer: csv,
  });
  await page.getByRole("button", { name: "Import CSV" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 0; skipped");
  const denied = await request.post("/api/gmail/sync", {
    headers: { Origin: "https://evil.example" },
  });
  expect(denied.status()).toBe(403);
  const safe = await request.post("/api/gmail/sync", {
    headers: { Origin: "http://localhost:3011" },
  });
  expect(safe.status()).toBe(400);
  expect(await safe.json()).toMatchObject({
    error: "Connect Gmail in Settings first.",
  });
});
test("mobile navigation remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("button", { name: "Toggle navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Applications", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Applications", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/applications-mobile.png",
    fullPage: true,
  });
});
test("local AI settings persist, test a local model, and reject a cloud URL", async ({
  page,
}) => {
  const server = createServer((req, res) => {
    req.resume();
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        model_info: { "general.architecture": "qwen2" },
        capabilities: ["completion"],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await page.goto("/settings");
    await page.getByLabel("Enable local AI", { exact: true }).check();
    await page
      .getByLabel("Ollama URL", { exact: true })
      .fill(`http://127.0.0.1:${port}`);
    await page.getByLabel("Confidence threshold", { exact: true }).fill("0.85");
    await page
      .getByRole("button", { name: "Test connection", exact: true })
      .click();
    await expect(
      page.getByText("Connected to local Ollama.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save AI settings", exact: true })
      .click();
    await expect(
      page.getByText("Local AI settings saved.", { exact: false }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Enable local AI", { exact: true }),
    ).toBeChecked();
    await expect(page.getByLabel("Model name", { exact: true })).toHaveValue(
      "qwen2.5:3b",
    );
    await expect(
      page.getByLabel("Confidence threshold", { exact: true }),
    ).toHaveValue("0.85");
    await page
      .getByLabel("Ollama URL", { exact: true })
      .fill("https://ollama.com");
    await page
      .getByRole("button", { name: "Test connection", exact: true })
      .click();
    await expect(
      page.getByText("Only HTTP loopback Ollama URLs are allowed.", {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.userSettings.update({
      where: { id: "local" },
      data: {
        localAiEnabled: false,
        ollamaUrl: "http://localhost:11434",
        aiConfidenceThreshold: 0.7,
      },
    });
  }
});
test("low-confidence AI mail stays unchanged until the user approves its classification", async ({
  page,
}) => {
  const c = await db.company.create({
    data: {
      name: `Browser Test AI ${Date.now()}`,
      normalizedName: `browser ai ${Date.now()}`,
    },
  });
  const a = await db.application.create({
    data: {
      companyId: c.id,
      jobTitle: "AI Review Internship",
      duplicateKey: `ai-review-${Date.now()}`,
      status: "Awaiting reply",
      dateApplied: new Date("2026-10-01"),
    },
  });
  await db.emailThread.create({
    data: {
      gmailThreadId: `ai-browser-test-${Date.now()}`,
      applicationId: a.id,
      subject: "AI browser review",
      messages: {
        create: {
          gmailMessageId: `ai-browser-message-${Date.now()}`,
          sender: "recruiter@example.test",
          subject: "AI browser review",
          snippet: "We would like to meet.",
          classification: "INTERVIEW",
          classificationSource: "OLLAMA",
          classificationConfidence: 0.6,
          classificationReason: "Possible interview; unclear invitation.",
          suggestedCompany: c.name,
          suggestedRole: a.jobTitle,
          suggestedApplicationId: a.id,
          matchConfidence: 1,
          needsReview: true,
          receivedAt: new Date("2026-10-08"),
        },
      },
    },
  });
  await page.goto("/inbox");
  await expect(page.getByText("Needs Review", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Local AI suggestion · 60% confidence"),
  ).toBeVisible();
  expect(
    (await db.application.findUniqueOrThrow({ where: { id: a.id } })).status,
  ).toBe("Awaiting reply");
  await page
    .getByRole("combobox", { name: "Review email classification" })
    .selectOption("ASSESSMENT");
  await page
    .getByRole("button", { name: "Confirm match & status", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm match & status", exact: true }),
  ).toHaveCount(0);
  expect(
    (await db.application.findUniqueOrThrow({ where: { id: a.id } })).status,
  ).toBe("Assessment");
});
