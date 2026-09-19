import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { create_routes, type Storage, type StorageFile } from "./index";

class MemoryStorage implements Storage {
	private readonly files = new Map<string, Uint8Array>();

	seed(path: string, contents: string | Uint8Array) {
		const data =
			typeof contents === "string"
				? new TextEncoder().encode(contents)
				: contents;
		this.files.set(path, data);
	}

	file(path: string): StorageFile {
		return {
			exists: async () => this.files.has(path),
			stream: () => new Blob([this.files.get(path)!]),
			write: async (data) => {
				this.files.set(path, data);
			},
		};
	}
}

const ORIGIN = "yeet.page";
const PLATFORM_404 = new Blob(["platform-404"], { type: "text/html" });
const PLATFORM_INDEX = new Blob(["platform-index"], { type: "text/html" });

function routes_for(storage: MemoryStorage) {
	return create_routes({
		storage,
		origin: ORIGIN,
		platform404: PLATFORM_404,
		platformIndex: PLATFORM_INDEX,
	});
}

function deploy_request(domain: string, pathname: string) {
	return new Request(`http://${domain}.${ORIGIN}${pathname}`);
}

describe("SPA 200.html fallback", () => {
	test("unknown path returns 200.html with status 200 when present", async () => {
		const storage = new MemoryStorage();
		storage.seed(join("spa-site", "index.html"), "<h1>home</h1>");
		storage.seed(join("spa-site", "200.html"), "<h1>spa-fallback</h1>");

		const response = await routes_for(storage)["/*"].GET(
			deploy_request("spa-site", "/app/settings"),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/html");
		expect(await response.text()).toBe("<h1>spa-fallback</h1>");
	});

	test("unknown path returns platform 404 when 200.html is missing", async () => {
		const storage = new MemoryStorage();
		storage.seed(join("plain-site", "index.html"), "<h1>home</h1>");

		const response = await routes_for(storage)["/*"].GET(
			deploy_request("plain-site", "/missing-page"),
		);

		expect(response.status).toBe(404);
		expect(await response.text()).toBe("platform-404");
	});

	test("exact files still win over the SPA fallback", async () => {
		const storage = new MemoryStorage();
		storage.seed(join("spa-site", "about.html"), "<h1>about</h1>");
		storage.seed(join("spa-site", "200.html"), "<h1>spa-fallback</h1>");

		const response = await routes_for(storage)["/*"].GET(
			deploy_request("spa-site", "/about.html"),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("<h1>about</h1>");
	});
});
