import { S3Client, serve } from "bun";
import { join, normalize } from "node:path";
import { randomBytes } from "node:crypto";
import mime from "mime";
import type { File } from "node:buffer";

const {
	S3_REGION,
	S3_ENDPOINT,
	S3_ACCESS_KEY_ID,
	S3_ACCESS_KEY_SECRET,
	S3_BUCKET,
	ORIGIN,
} = process.env;

const client = new S3Client({
	region: S3_REGION,
	endpoint: S3_ENDPOINT,
	accessKeyId: S3_ACCESS_KEY_ID,
	secretAccessKey: S3_ACCESS_KEY_SECRET,
	bucket: S3_BUCKET,
});

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

// Generator function to process files in batches of N
async function* processBatch<T, R>(
	items: T[],
	batchSize: number,
	processor: (item: T) => Promise<R>
): AsyncGenerator<R[], void, unknown> {
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const results = await Promise.all(batch.map(processor));
		yield results;
	}
}

const http = serve({
	routes: {
		"/publish": {
			POST: async (req) => {
				const url = new URL(req.url);
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
					const files = file_entries.filter((file) => typeof file !== "string");
					
					// Process files in batches of 10
					const processFile = async (file: File) => {
						// Check file size (5MB limit)
						if (file.size > 5 * 1024 * 1024) {
							throw new Error(
								`File ${file.name} exceeds 5MB limit (${Math.round((file.size / 1024 / 1024) * 100) / 100}MB)`,
								{
									cause: 400,
								},
							);
						}

						// Prevent path traversal and normalize path
						const safe_relative_path = normalize(file.name);
						const s3_path = join(
							"yeet",
							domain,
							safe_relative_path,
						);
						const array_buffer = await file.arrayBuffer();
						const buffer = new Uint8Array(array_buffer);

						await client.file(s3_path).write(buffer);
					};

					// Process files in batches of 25 concurrently
					for await (const batch of processBatch(files, 25, processFile)) {
						console.log(`Processed batch of ${batch.length} files from ${files.length}`);
					}

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
	},

	async fetch(req) {
		const { hostname, pathname } = new URL(req.url);

		// Normalize hostname to lowercase
		const normalized_hostname = hostname.toLowerCase();
		// Check if it's a subdomain based on configured domain
		const is_subdomain =
			normalized_hostname !== ORIGIN &&
			normalized_hostname.endsWith(`.${ORIGIN}`);

		if (is_subdomain) {
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
				return new Response(file.stream(), {
					headers: {
						"Content-Type": mime.getType(file_path)!,
					},
				});
			}

			// For extensionless paths, try .html (for clean URLs)
			if (!safe_path.includes(".") && !safe_path.endsWith("/")) {
				const html_file = client.file(file_path + ".html");
				if (await html_file.exists()) {
					return new Response(html_file.stream(), {
						headers: {
							"Content-Type": "text/html",
						},
					});
				}

				// Also try as directory with index.html
				const dir_index = client.file(join(file_path, "index.html"));
				if (await dir_index.exists()) {
					return new Response(dir_index.stream(), {
						headers: {
							"Content-Type": "text/html",
						},
					});
				}
			}

			// Serve 200.html if exists for client side routing with SPA
			const fallback_file = client.file(join(folder_path, "200.html"));
			if (await fallback_file.exists()) {
				return new Response(fallback_file.stream(), {
					status: 404,
					headers: {
						"Content-Type": "text/html",
					},
				});
			}

			return new Response("File Not Found", { status: 404 });
		}

		// Handle root domain - serve a simple landing page
		return new Response("Welcome to Yeet - Static Site Hosting", {
			status: 200,
		});
	},
});

console.log(`Listening on http://localhost:${http.port}`);
