import type { File } from "node:buffer";
import { randomBytes } from "node:crypto";
import { join, normalize } from "node:path";
import { S3Client, serve } from "bun";
import mime from "mime";

export type StorageFile = {
	exists(): Promise<boolean>;
	stream(): ReadableStream | Blob;
	write(data: Uint8Array): Promise<unknown>;
};

export type Storage = {
	file(path: string): StorageFile;
};

// Deployments are immutable (new subdomain per publish), so deploy assets can be cached forever.
export function get_deploy_cache_headers() {
	return {
		"Cache-Control": "public, max-age=31536000, immutable",
		Expires: new Date(Date.now() + 31536000000).toUTCString(),
	};
}

// Apex landing / platform assets are mutable across releases.
export function get_apex_cache_headers() {
	return {
		"Cache-Control": "public, max-age=0, must-revalidate",
	};
}

// Generate a random domain name
export function generate_random_domain(): string {
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

export function file_response(
	body: ReadableStream | Blob,
	content_type: string,
	status = 200,
	cache_headers: Record<string, string> = get_deploy_cache_headers(),
) {
	return new Response(body, {
		status,
		headers: {
			"Content-Type": content_type,
			...cache_headers,
		},
	});
}

export type ServerOptions = {
	storage: Storage;
	origin: string;
	platform404: Blob;
	platformIndex: Blob;
	platformOg?: Blob;
	port?: number;
};

export function create_routes(options: ServerOptions) {
	const { storage, origin, platform404, platformIndex, platformOg } = options;

	return {
		"/publish": {
			POST: async (req: Request) => {
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
					// Process all files concurrently
					await Promise.all(
						files.map(async (file) => {
							// Check file size (50MB limit)
							if (file.size > 50 * 1024 * 1024) {
								throw new Error(
									`File ${file.name} exceeds 50MB limit (${Math.round((file.size / 1024 / 1024) * 100) / 100}MB)`,
									{
										cause: 400,
									},
								);
							}

							// Prevent path traversal and normalize path
							const safe_relative_path = normalize(file.name);
							const s3_path = join(domain, safe_relative_path);
							const array_buffer = await file.arrayBuffer();
							const buffer = new Uint8Array(array_buffer);
							await storage.file(s3_path).write(buffer);
						}),
					);

					return Response.json(
						{
							domain: `${domain}.${origin}`,
							url: `https://${domain}.${origin}`,
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
			GET: async (req: Request) => {
				const { hostname, pathname } = new URL(req.url);

				// Normalize hostname to lowercase
				const normalized_hostname = hostname.toLowerCase();
				// Check if it's a subdomain based on configured domain
				const is_subdomain =
					normalized_hostname !== origin &&
					normalized_hostname.endsWith(`.${origin}`);

				if (is_subdomain) {
					// Prevent path traversal and normalize path
					const safe_path = normalize(pathname);
					const domain = normalized_hostname.replace(`.${origin}`, "");
					let file_path = join(domain, safe_path);

					// Handle trailing slash
					if (file_path.endsWith("/")) {
						file_path += "index.html";
					}

					// Try exact file first
					const file = storage.file(file_path);
					if (await file.exists()) {
						const content_type =
							mime.getType(file_path) || "application/octet-stream";
						return file_response(file.stream(), content_type);
					}

					// For extensionless paths, try .html (for clean URLs)
					if (!safe_path.includes(".") && !safe_path.endsWith("/")) {
						const html_file = storage.file(`${file_path}.html`);
						if (await html_file.exists()) {
							return file_response(html_file.stream(), "text/html");
						}

						// Also try as directory with index.html
						const dir_index = storage.file(join(file_path, "index.html"));
						if (await dir_index.exists()) {
							return file_response(dir_index.stream(), "text/html");
						}
					}

					// Serve 200.html if exists for client-side SPA routing
					const fallback_file = storage.file(join(domain, "200.html"));
					if (await fallback_file.exists()) {
						return file_response(fallback_file.stream(), "text/html", 200);
					}

					return new Response(platform404, {
						status: 404,
						headers: {
							"Content-Type": "text/html",
							...get_apex_cache_headers(),
						},
					});
				}

				// Apex: OG image
				if (pathname === "/og.png" && platformOg) {
					return file_response(
						platformOg,
						"image/png",
						200,
						get_apex_cache_headers(),
					);
				}

				// Apex: landing page
				return new Response(platformIndex, {
					status: 200,
					headers: {
						"Content-Type": "text/html",
						...get_apex_cache_headers(),
					},
				});
			},
		},
	};
}

export function start_server(options: ServerOptions) {
	const routes = create_routes(options);

	return serve({
		port: options.port,
		routes,
		fetch() {
			return new Response(options.platform404, {
				status: 404,
				headers: {
					"Content-Type": "text/html",
					...get_apex_cache_headers(),
				},
			});
		},
	});
}

const {
	S3_REGION,
	S3_ENDPOINT,
	S3_ACCESS_KEY_ID,
	S3_ACCESS_KEY_SECRET,
	S3_BUCKET,
	ORIGIN,
} = Bun.env;

const is_main = import.meta.main;

if (is_main) {
	const client = new S3Client({
		region: S3_REGION!,
		endpoint: S3_ENDPOINT!,
		accessKeyId: S3_ACCESS_KEY_ID!,
		secretAccessKey: S3_ACCESS_KEY_SECRET!,
		bucket: S3_BUCKET!,
	});

	const http = start_server({
		storage: client,
		origin: ORIGIN!,
		platform404: Bun.file("./404.html"),
		platformIndex: Bun.file("./index.html"),
		platformOg: Bun.file("./og.png"),
	});

	console.log(`Listening on http://localhost:${http.port}`);
}
