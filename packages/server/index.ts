import type { File } from "node:buffer";
import { randomBytes } from "node:crypto";
import { join, normalize } from "node:path";
import { RedisClient, S3Client, type S3File, serve } from "bun";
import mime from "mime";

const {
	S3_REGION,
	S3_ENDPOINT,
	S3_ACCESS_KEY_ID,
	S3_ACCESS_KEY_SECRET,
	S3_BUCKET,
	REDIS_URL,
	ORIGIN,
} = process.env;

const db = new RedisClient(REDIS_URL!);
const client = new S3Client({
	region: S3_REGION!,
	endpoint: S3_ENDPOINT!,
	accessKeyId: S3_ACCESS_KEY_ID!,
	secretAccessKey: S3_ACCESS_KEY_SECRET!,
	bucket: S3_BUCKET!,
});

function get_cache_headers() {
	return {
		"Cache-Control": "public, max-age=31536000",
		Expires: new Date(Date.now() + 31536000000).toUTCString(),
	};
}

async function report_bandwith_for_s3(file: S3File) {
	const stat = await file.stat();
	db.hincrby("stats", "bandwidth", stat.size);
}

// Format bytes to human readable format
function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

// Format numbers with locale-aware abbreviations
function formatNumber(num: number): string {
	if (num < 1000) {
		return new Intl.NumberFormat("en-US").format(num);
	}

	const formatter = new Intl.NumberFormat("en-US", {
		notation: "compact",
		compactDisplay: "short",
		maximumFractionDigits: 1,
	});

	return formatter.format(num);
}

// Generate a random domain name
function generate_random_domain(): string {
	const adjectives = [
		"fast",
		"quick",
		"bright",
		"cool",
		"warm",
		"fresh",
		"clean",
		"smart",
		"bold",
		"calm",
		"stupid",
		"clever",
		"intelligent",
		"brilliant",
		"genius",
		"insightful",
		"knowledgeable",
		"learned",
		"smart",
		"wise",
	];
	const nouns = [
		"cat",
		"dog",
		"bird",
		"fish",
		"tree",
		"star",
		"moon",
		"sun",
		"wave",
		"fire",
		"cloud",
		"rain",
		"wind",
		"storm",
	];

	const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
	const noun = nouns[Math.floor(Math.random() * nouns.length)];
	const suffix = randomBytes(2).toString("hex");

	return `${adjective}-${noun}-${suffix}`;
}

const http = serve({
	routes: {
		"/publish": {
			POST: async (req) => {
				const content_type = req.headers.get("content-type");

				if (!content_type?.includes("multipart/form-data")) {
					return Response.json(
						{ error: "Content-Type must be multipart/form-data" },
						{ status: 400 },
					);
				}

				const form_data = await req.formData();
				const file_entries = form_data.getAll("files");

				// Generate a random domain
				const domain = generate_random_domain();

				if (!file_entries || file_entries.length === 0) {
					return Response.json(
						{ error: "At least one file is required" },
						{ status: 400 },
					);
				}

				try {
					// Filter out string entries and validate files
					const files = file_entries.filter(
						(file): file is File => typeof file !== "string" && !!file.name,
					);
					let bytes = 0;
					// Process all files concurrently
					await Promise.all(
						files.map(async (file) => {
							// Check file size (10MB limit)
							if (file.size > 10 * 1024 * 1024) {
								throw new Error(
									`File ${file.name} exceeds 10MB limit (${Math.round((file.size / 1024 / 1024) * 100) / 100}MB)`,
									{
										cause: 400,
									},
								);
							}

							// Prevent path traversal and normalize path
							const safe_relative_path = normalize(file.name);
							const s3_path = join("yeet", domain, safe_relative_path);
							const array_buffer = await file.arrayBuffer();
							const buffer = new Uint8Array(array_buffer);
							bytes += await client.file(s3_path).write(buffer);
						}),
					);

					db.hincrby("stats", "bandwidth", bytes);
					db.hincrby("stats", "deployments", 1);

					return Response.json(
						{
							domain: `${domain}.${ORIGIN}`,
							url: `https://${domain}.${ORIGIN}`,
							total_files: files.length,
						},
						{ status: 201 },
					);
				} catch (error) {
					console.error(error);
					// check error cause is 400, if not its 500
					if (error instanceof Error && error.cause === 400) {
						return Response.json(
							{
								error: error.message,
							},
							{ status: 400 },
						);
					} else {
						return Response.json(
							{
								error: "Internal server error",
							},
							{ status: 500 },
						);
					}
				}
			},
		},
		"/*": {
			GET: async (req) => {
				const { hostname, pathname } = new URL(req.url);

				// Normalize hostname to lowercase
				const normalized_hostname = hostname.toLowerCase();
				// Check if it's a subdomain based on configured domain
				const is_subdomain =
					normalized_hostname !== ORIGIN &&
					normalized_hostname.endsWith(`.${ORIGIN}`);

				if (is_subdomain) {
					db.hincrby("stats", "requests", 1);
					// Prevent path traversal and normalize path
					const safe_path = normalize(pathname);
					const domain = normalized_hostname.replace(`.${ORIGIN}`, "");
					const folder_path = join("yeet", domain);
					let file_path = join(folder_path, safe_path);

					// Handle trailing slash
					if (file_path.endsWith("/")) {
						file_path += "index.html";
					}

					// Try exact file first
					const file = client.file(file_path);
					if (await file.exists()) {
						report_bandwith_for_s3(file);

						return new Response(file.stream(), {
							headers: {
								"Content-Type": mime.getType(file_path)!,
								...get_cache_headers(),
							},
						});
					}

					// For extensionless paths, try .html (for clean URLs)
					if (!safe_path.includes(".") && !safe_path.endsWith("/")) {
						const html_file = client.file(`${file_path}.html`);
						if (await html_file.exists()) {
							report_bandwith_for_s3(html_file);

							return new Response(html_file.stream(), {
								headers: {
									"Content-Type": "text/html",
									...get_cache_headers(),
								},
							});
						}

						// Also try as directory with index.html
						const dir_index = client.file(join(file_path, "index.html"));
						if (await dir_index.exists()) {
							report_bandwith_for_s3(dir_index);

							return new Response(dir_index.stream(), {
								headers: {
									"Content-Type": "text/html",
									...get_cache_headers(),
								},
							});
						}
					}

					// Serve 200.html if exists for client side routing with SPA
					const fallback_file = client.file(join(folder_path, "200.html"));
					if (await fallback_file.exists()) {
						report_bandwith_for_s3(fallback_file);

						return new Response(fallback_file.stream(), {
							status: 404,
							headers: {
								"Content-Type": "text/html",
								...get_cache_headers(),
							},
						});
					}

					return new Response(Bun.file("./404.html"), {
						status: 404,
					});
				}

				// Handle root domain - serve a simple landing page
				const website = await Bun.file("./index.html").text();
				const stats: {
					requests?: number | undefined;
					bandwidth?: number | undefined;
					deployments?: number | undefined;
				} | null = await db.hgetall("stats");

				// Inject stats into HTML
				const statsHtml = website
					.replace(
						"{{TOTAL_DEPLOYMENTS}}",
						formatNumber(stats?.deployments || 0),
					)
					.replace("{{TOTAL_REQUESTS}}", formatNumber(stats?.requests || 0))
					.replace("{{TOTAL_BANDWIDTH}}", formatBytes(stats?.bandwidth || 0));

				return new Response(statsHtml, {
					status: 200,
					headers: {
						"Content-Type": "text/html",
					},
				});
			},
		},
	},
	fetch() {
		return new Response(Bun.file("./404.html"), { status: 404 });
	},
});

console.log(`Listening on http://localhost:${http.port}`);
