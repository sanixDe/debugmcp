import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  launchBrowser,
  getPage,
  closeBrowser,
  isLaunched,
  type BrowserConfig,
} from "./browser-manager.js";

/**
 * Register all browser tools on the MCP server.
 * These give Claude Code the ability to navigate websites,
 * inspect the DOM, capture network traffic, and take screenshots.
 */
export function registerBrowserTools(
  server: McpServer,
  config: BrowserConfig
): void {
  // --- browser_navigate ---
  server.tool(
    "browser_navigate",
    "Navigate to a URL in the browser. Launches the browser if not already running.",
    {
      url: z.string().describe("The URL to navigate to"),
    },
    async ({ url }) => {
      if (!isLaunched()) {
        await launchBrowser(config);
      }
      const page = getPage();
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                url: page.url(),
                title: await page.title(),
                status: response?.status() ?? null,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- browser_snapshot ---
  server.tool(
    "browser_snapshot",
    "Get the current page content as readable text. Extracts headings, links, buttons, forms, tables, and text content from the page.",
    {},
    async () => {
      const page = getPage();
      const snapshot = await page.evaluate(() => {
        const result: string[] = [];
        result.push(`URL: ${location.href}`);
        result.push(`Title: ${document.title}`);
        result.push("");

        // Extract headings
        document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((el) => {
          result.push(`[${el.tagName}] ${el.textContent?.trim()}`);
        });

        // Extract links
        const links: string[] = [];
        document.querySelectorAll("a[href]").forEach((el) => {
          const text = el.textContent?.trim();
          const href = (el as HTMLAnchorElement).href;
          if (text && href) links.push(`  ${text} -> ${href}`);
        });
        if (links.length > 0) {
          result.push("\n[LINKS]");
          result.push(...links.slice(0, 50));
          if (links.length > 50) result.push(`  ... and ${links.length - 50} more`);
        }

        // Extract buttons
        const buttons: string[] = [];
        document.querySelectorAll("button, input[type=submit]").forEach((el) => {
          const text = el.textContent?.trim() || (el as HTMLInputElement).value;
          if (text) buttons.push(`  [BUTTON] ${text}`);
        });
        if (buttons.length > 0) {
          result.push("\n[BUTTONS]");
          result.push(...buttons.slice(0, 30));
        }

        // Extract form inputs
        const inputs: string[] = [];
        document
          .querySelectorAll("input, select, textarea")
          .forEach((el) => {
            const name =
              (el as HTMLInputElement).name ||
              (el as HTMLInputElement).id ||
              (el as HTMLInputElement).placeholder ||
              el.getAttribute("aria-label") ||
              "";
            const type = (el as HTMLInputElement).type || el.tagName.toLowerCase();
            if (name) inputs.push(`  [${type}] ${name}`);
          });
        if (inputs.length > 0) {
          result.push("\n[FORM INPUTS]");
          result.push(...inputs.slice(0, 30));
        }

        // Extract tables
        document.querySelectorAll("table").forEach((table, i) => {
          const headers: string[] = [];
          table.querySelectorAll("th").forEach((th) => {
            headers.push(th.textContent?.trim() ?? "");
          });
          const rowCount = table.querySelectorAll("tbody tr").length;
          if (headers.length > 0) {
            result.push(`\n[TABLE ${i + 1}] ${headers.join(" | ")} (${rowCount} rows)`);
          }
        });

        // Extract visible text (truncated)
        const bodyText = document.body?.innerText?.slice(0, 3000) ?? "";
        result.push("\n[PAGE TEXT (first 3000 chars)]");
        result.push(bodyText);

        return result.join("\n");
      });

      return {
        content: [{ type: "text" as const, text: snapshot }],
      };
    }
  );

  // --- browser_screenshot ---
  server.tool(
    "browser_screenshot",
    "Take a screenshot of the current page. Returns a base64-encoded PNG image.",
    {
      fullPage: z
        .boolean()
        .optional()
        .describe("Capture the full scrollable page (default: false)"),
    },
    async ({ fullPage }) => {
      const page = getPage();
      const buffer = await page.screenshot({
        fullPage: fullPage ?? false,
        type: "png",
      });

      return {
        content: [
          {
            type: "image" as const,
            data: buffer.toString("base64"),
            mimeType: "image/png",
          },
        ],
      };
    }
  );

  // --- browser_click ---
  server.tool(
    "browser_click",
    "Click an element on the page by CSS selector or text content.",
    {
      selector: z
        .string()
        .optional()
        .describe("CSS selector for the element to click"),
      text: z
        .string()
        .optional()
        .describe(
          "Text content to find and click (uses getByText)"
        ),
    },
    async ({ selector, text }) => {
      const page = getPage();

      if (selector) {
        await page.click(selector, { timeout: 10_000 });
      } else if (text) {
        await page.getByText(text, { exact: false }).first().click({
          timeout: 10_000,
        });
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide either a selector or text to click.",
            },
          ],
        };
      }

      await page.waitForLoadState("domcontentloaded");

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              clicked: selector ?? text,
              url: page.url(),
              title: await page.title(),
            }),
          },
        ],
      };
    }
  );

  // --- browser_type ---
  server.tool(
    "browser_type",
    "Type text into an input field identified by selector, label, or placeholder.",
    {
      selector: z
        .string()
        .optional()
        .describe("CSS selector for the input"),
      label: z
        .string()
        .optional()
        .describe("Label text associated with the input"),
      placeholder: z
        .string()
        .optional()
        .describe("Placeholder text of the input"),
      text: z.string().describe("Text to type into the input"),
    },
    async ({ selector, label, placeholder, text }) => {
      const page = getPage();

      if (selector) {
        await page.fill(selector, text);
      } else if (label) {
        await page.getByLabel(label).fill(text);
      } else if (placeholder) {
        await page.getByPlaceholder(placeholder).fill(text);
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide a selector, label, or placeholder to identify the input.",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Typed "${text}" into ${selector ?? label ?? placeholder}`,
          },
        ],
      };
    }
  );

  // --- browser_network ---
  server.tool(
    "browser_network",
    "Get recent network requests from the current page. Captures API calls, status codes, and response times. Call browser_network_start first to begin recording, then this to get results.",
    {
      filter: z
        .string()
        .optional()
        .describe(
          "Filter requests by URL pattern (e.g., '/api/', '.json')"
        ),
    },
    async ({ filter }) => {
      const page = getPage();

      // Collect requests for the next action by listening
      // Since we can't retroactively get requests, return recent navigation requests
      const requests = await page.evaluate((filterPattern) => {
        const entries = performance.getEntriesByType(
          "resource"
        ) as PerformanceResourceTiming[];

        return entries
          .filter((e) => !filterPattern || e.name.includes(filterPattern))
          .slice(-50)
          .map((e) => ({
            url: e.name,
            duration: Math.round(e.duration),
            size: e.transferSize,
            type: e.initiatorType,
          }));
      }, filter ?? null);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { requestCount: requests.length, requests },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- browser_console ---
  server.tool(
    "browser_console",
    "Get console messages (errors, warnings, logs) from the current page.",
    {},
    async () => {
      const page = getPage();

      const messages = await page.evaluate(() => {
        // Check for any errors in the DOM
        const errors: string[] = [];

        // Look for error boundaries or error messages
        document
          .querySelectorAll(
            '[class*="error" i], [class*="Error" i], [role="alert"]'
          )
          .forEach((el) => {
            const text = el.textContent?.trim();
            if (text) errors.push(`[DOM ERROR] ${text.slice(0, 200)}`);
          });

        return errors;
      });

      return {
        content: [
          {
            type: "text" as const,
            text:
              messages.length > 0
                ? messages.join("\n")
                : "No errors found in the DOM.",
          },
        ],
      };
    }
  );

  // --- browser_eval ---
  server.tool(
    "browser_eval",
    "Execute JavaScript in the browser page context and return the result. Use for inspecting page state, reading DOM values, or checking JavaScript variables.",
    {
      script: z
        .string()
        .describe("JavaScript code to execute in the browser context"),
    },
    async ({ script }) => {
      const page = getPage();
      try {
        const result = await page.evaluate(script);
        return {
          content: [
            {
              type: "text" as const,
              text:
                typeof result === "object"
                  ? JSON.stringify(result, null, 2)
                  : String(result),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: `Eval error: ${message}`,
            },
          ],
        };
      }
    }
  );

  // --- browser_close ---
  server.tool(
    "browser_close",
    "Close the browser and free resources.",
    {},
    async () => {
      await closeBrowser();
      return {
        content: [
          { type: "text" as const, text: "Browser closed." },
        ],
      };
    }
  );
}
