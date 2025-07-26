#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import chalk from "chalk";
import { defineCommand, runMain } from "citty";

const DEFAULT_SERVER_URL = "https://yeet.page";

function getServerUrl(): string {
	return (
		process.env.YEET_SERVER_URL || process.env.SERVER_URL || DEFAULT_SERVER_URL
	);
}

// Animation frames for loading spinner
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ASCII Art for publishing
const YEET_ASCII = `
    ╦ ╦╔═╗╔═╗╔╦╗
    ╚╦╝║╣ ║╣  ║ 
     ╩ ╚═╝╚═╝ ╩ 
   to the cloud...
`;

class LoadingSpinner {
	private interval: Timer | null = null;
	private frameIndex = 0;
	private message: string;

	constructor(message: string) {
		this.message = message;
	}

	start() {
		process.stdout.write("\x1B[?25l"); // Hide cursor
		this.interval = setInterval(() => {
			const frame = spinnerFrames[this.frameIndex % spinnerFrames.length];
			process.stdout.write(`\r${frame} ${this.message}`);
			this.frameIndex++;
		}, 80);
	}

	stop() {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
		process.stdout.write("\r\x1B[K"); // Clear line
		process.stdout.write("\x1B[?25h"); // Show cursor
	}

	success(message: string) {
		this.stop();
		console.log(chalk.green(`✅ ${message}`));
	}

	error(message: string) {
		this.stop();
		console.log(chalk.red(`❌ ${message}`));
	}
}

async function getAllFiles(dir: string): Promise<string[]> {
	const files: string[] = [];

	async function walk(currentDir: string) {
		const entries = await readdir(currentDir);

		for (const entry of entries) {
			const fullPath = join(currentDir, entry);
			const stats = await stat(fullPath);

			if (stats.isDirectory()) {
				// Skip common directories that shouldn't be deployed
				if (
					[
						".git",
						"node_modules",
						".next",
						"dist",
						"build",
						".vercel",
						".netlify",
						".DS_Store",
					].includes(entry)
				) {
					continue;
				}
				await walk(fullPath);
			} else {
				// Skip common files that shouldn't be deployed
				if (
					![
						".DS_Store",
						".gitignore",
						".env",
						".env.local",
						".env.production",
						"Thumbs.db",
					].includes(entry)
				) {
					files.push(fullPath);
				}
			}
		}
	}

	await walk(dir);
	return files;
}

function formatFileSize(bytes: number): string {
	const sizes = ["B", "KB", "MB", "GB"];
	if (bytes === 0) return "0 B";
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

async function calculateTotalSize(files: string[]): Promise<number> {
	let totalSize = 0;
	for (const filePath of files) {
		const stats = await stat(filePath);
		totalSize += stats.size;
	}
	return totalSize;
}

interface PublishResponse {
	url: string;
	domain: string;
	total_files: number;
	error: string;
}
async function publishSite(
	sourcePath: string,
	serverUrl: string,
): Promise<
	{
		totalSize: number;
	} & PublishResponse
> {
	try {
		// Step 1: Scanning files
		const scanSpinner = new LoadingSpinner(chalk.blue("Scanning files..."));
		scanSpinner.start();

		const files = await getAllFiles(sourcePath);
		const totalSize = await calculateTotalSize(files);

		if (files.length === 0) {
			scanSpinner.error("No files found to publish");
			process.exit(1);
		}

		scanSpinner.success("Files scanned successfully");

		// Step 2: Show ASCII art
		console.log(chalk.magenta(YEET_ASCII));

		// Step 3: Prepare upload (use spinner instead of progress bar)
		scanSpinner.start();
		scanSpinner.stop();

		const prepSpinner = new LoadingSpinner(chalk.blue("📦 Preparing files..."));
		prepSpinner.start();

		const formData = new FormData();

		for (const filePath of files) {
			const relativePath = relative(sourcePath, filePath);
			const file = Bun.file(filePath);

			const fileBlob = new File([await file.arrayBuffer()], relativePath, {
				type: file.type || "application/octet-stream",
			});

			formData.append("files", fileBlob);
		}

		prepSpinner.success(`Prepared ${files.length} files for upload`);

		// Simple ASCII spinner
		const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
		let frameIndex = 0;
		let uploadComplete = false;

		console.log(); // Add space before spinner

		// Start spinner
		const spinnerInterval = setInterval(() => {
			if (!uploadComplete) {
				process.stdout.write(
					`\r${chalk.cyan(spinnerFrames[frameIndex])} Uploading files...`,
				);
				frameIndex = (frameIndex + 1) % spinnerFrames.length;
			}
		}, 80);

		let result: PublishResponse;
		try {
			const response = await fetch(`${serverUrl}/publish`, {
				method: "POST",
				body: formData,
			});

			// Stop spinner and show completion
			uploadComplete = true;
			clearInterval(spinnerInterval);
			process.stdout.write(
				`\r${chalk.green("✅ Files uploaded successfully!")}      \n`,
			);

			const processSpinner = new LoadingSpinner(
				chalk.green("🔄 Processing deployment..."),
			);
			processSpinner.start();

			try {
				result = await response.json();
			} catch {
				processSpinner.error("Server returned invalid response");
				console.log(chalk.red("Raw response:"), await response.text());
				process.exit(1);
			}

			if (!response.ok) {
				processSpinner.error(
					`Deployment failed: ${result.error || "Unknown error"}`,
				);
				console.log(chalk.gray(`Status: ${response.status}`));
				process.exit(1);
			}

			processSpinner.success("Deployment processed successfully!");
		} catch (error) {
			// Stop spinner and clean up
			uploadComplete = true;
			clearInterval(spinnerInterval);
			process.stdout.write(`\r${" ".repeat(50)}\r`); // Clear the line

			console.error(
				chalk.red(
					`❌ Publishing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				),
			);

			if (error instanceof TypeError && error.message.includes("fetch")) {
				console.log(
					chalk.yellow("💡 Hint: Make sure the Yeet server is running!"),
				);
				console.log(chalk.gray(`   Try: bun run dev in the server package`));
			}

			process.exit(1);
		}

		// Return result with totalSize for summary display
		return { ...result, totalSize };
	} catch (error) {
		console.log();
		console.error(
			chalk.red(
				`❌ Publishing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			),
		);

		if (error instanceof TypeError && error.message.includes("fetch")) {
			console.log(
				chalk.yellow("💡 Hint: Make sure the Yeet server is running!"),
			);
			console.log(chalk.gray(`   Try: bun run dev in the server package`));
		}

		process.exit(1);
	}
}

const main = defineCommand({
	meta: {
		name: "yeet",
		description:
			"Publish static sites instantly ⚡\n\nConfiguration:\n  Create a .env file to set YEET_SERVER_URL or SERVER_URL",
		version: "1.0.0",
	},
	args: {
		directory: {
			type: "positional",
			description: "Directory to publish (defaults to current directory)",
			required: false,
		},
		server: {
			type: "string",
			alias: "s",
			description:
				"Server URL to publish to (can be set via YEET_SERVER_URL env var)",
			default: undefined,
		},
	},
	async run({ args }) {
		const targetDir = args.directory || process.cwd();
		const sourcePath = resolve(targetDir);

		// Validate source directory exists
		if (!existsSync(sourcePath)) {
			console.error(chalk.red(`❌ Directory does not exist: ${sourcePath}`));
			process.exit(1);
		}

		const stats = await stat(sourcePath);
		if (!stats.isDirectory()) {
			console.error(chalk.red(`❌ Path is not a directory: ${sourcePath}`));
			process.exit(1);
		}

		const serverUrl = args.server || getServerUrl();

		const result = await publishSite(sourcePath, serverUrl);

		// Step 5: Show deployment summary
		console.log(chalk.blue("📊 Deployment Summary:"));
		console.log(chalk.green(`   🌐 Site URL: ${chalk.bold(result.url)}`));
		console.log(chalk.cyan(`   🏷️  Domain: ${result.domain}`));
		console.log(chalk.yellow(`   📁 Files: ${result.total_files}`));
		console.log(chalk.gray(`   💾 Size: ${formatFileSize(result.totalSize)}`));

		console.log();
		console.log(chalk.green("🚀 Your site is now live and ready to share!"));
	},
});

runMain(main);
