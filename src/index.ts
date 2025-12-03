#!/usr/bin/env node
import express, { Request as ExpressRequest, Response as ExpressResponse } from "express";
import cors from "cors";
import { createMarkmap } from "./markmap/createMarkmap.js";
import minimist from "minimist";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import logger from "./utils/logger.js";

/**
 * Parses and validates command line arguments for the Markmap Stateless Server.
 *
 * @returns Configuration object with output directory option
 */
function parseArgs() {
    const args = minimist(process.argv.slice(2), {
        string: ["output"],
        boolean: ["help"],
        alias: {
            o: "output",
            h: "help"
        }
    });

    if (args.help) {
        logger.info(`Markmap Stateless Server - Mind map generator for Markdown

  Usage: markmap-stateless-server [options]

  Options:
    --output, -o <file>        Output HTML file directory (for file saving, optional)
    --help, -h                 Show this help message`);
        process.exit(0);
    }

    return {
        output: args.output || process.env.MARKMAP_DIR
    };
}

/**
 * Main function that initializes and starts the Markmap Stateless Server.
 * This function sets up HTTP endpoint on port 3000 for converting markdown to HTML.
 */
async function main() {
    const options = parseArgs();

    // Set up Express app
    const app = express();
    app.use(express.json());
    app.use(cors({
        origin: "*" // Allow all origins
    }));

    let outputPath;
    if (options.output) {
        if (!existsSync(options.output)) {
            mkdirSync(options.output, { recursive: true });
        }
        outputPath = options.output;
    } else {
        const tempDir = join(tmpdir(), "markmap");
        if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true });
        }
        outputPath = tempDir;
    }

    // Stateless POST endpoint to convert markdown to HTML
    app.post("/convert", async (req: ExpressRequest, res: ExpressResponse) => {
        const method = req.method;
        const url = req.url;
        const userAgent = req.headers['user-agent'] || '-';
        const timestamp = new Date().toISOString();

        console.log(JSON.stringify({
            timestamp,
            level: "info",
            method,
            url,
            userAgent,
            message: "HTTP request received"
        }));

        // Set appropriate headers for responses
        res.setHeader("Content-Type", "application/json");

        try {
            // Validate request body
            if (!req.body || typeof req.body !== 'object') {
                return res.status(400).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32600, // Invalid Request
                        message: "Invalid Request: Request body must be a JSON object"
                    },
                    id: req.body?.id || null
                });
            }

            // Extract markdown content (try different possible formats to keep close to MCP contract)
            let markdown: string | undefined;
            let requestId: string | number | null = req.body.id || null;

            // Check if it's an MCP-style request (JSON-RPC format)
            if (req.body.jsonrpc === "2.0" && req.body.method === "tools/markdown_to_mindmap") {
                markdown = req.body.params?.markdown;
            }
            // Check if it's a direct markdown request
            else if (req.body.markdown) {
                markdown = req.body.markdown;
            }
            // Check if it's wrapped in params like MCP
            else if (req.body.params && typeof req.body.params === 'object' && req.body.params.markdown) {
                markdown = req.body.params.markdown;
            }
            // If request body itself is a string, treat as markdown
            else if (typeof req.body === 'string') {
                markdown = req.body;
            }

            if (!markdown) {
                return res.status(400).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32602, // Invalid params
                        message: "Invalid params: 'markdown' property is required in request body"
                    },
                    id: requestId
                });
            }

            // Convert markdown to HTML
            const result = await createMarkmap({
                content: markdown,
                output: options.output ? join(outputPath, `markmap-${Date.now()}.html`) : undefined,
                openIt: false
            });

            // Format response similar to MCP contract
            const response = {
                jsonrpc: "2.0",
                result: {
                    content: [
                        {
                            type: "text",
                            text: result.content // Text content for compatibility
                        }
                    ],
                    structuredContent: {
                        html: result.content,
                        contentLength: result.content.length,
                        success: true
                    }
                },
                id: requestId
            };

            res.status(200).json(response);

        } catch (error) {
            const timestamp = new Date().toISOString();
            const method = req.method;
            const url = req.url;
            const userAgent = req.headers['user-agent'] || '-';

            console.error(JSON.stringify({
                timestamp,
                level: "error",
                method,
                url,
                userAgent,
                message: "Error handling markdown to HTML conversion request",
                error: error instanceof Error ? error.message : String(error)
            }));

            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32603, // Internal error
                        message: "Internal server error during markdown to HTML conversion"
                    },
                    id: req.body?.id || null
                });
            }
        }
    });

    // Health check endpoint
    app.get("/", (req: ExpressRequest, res: ExpressResponse) => {
        res.status(200).json({
            status: "ok",
            message: "Markmap Stateless Server is running",
            timestamp: new Date().toISOString()
        });
    });

    // Kubernetes health check endpoints
    app.get("/healthz", (req: ExpressRequest, res: ExpressResponse) => {
        // For now, we consider the server healthy if it's running
        // In a more sophisticated setup, you might check dependencies here
        res.status(200).json({
            status: "healthy",
            timestamp: new Date().toISOString()
        });
    });

    app.get("/readyz", (req: ExpressRequest, res: ExpressResponse) => {
        // For now, we consider the server ready if it's running
        // In a more sophisticated setup, you might check initialization status here
        res.status(200).json({
            status: "ready",
            timestamp: new Date().toISOString()
        });
    });

    // Start the server on port 3000
    const PORT = 3000;
    const server = app.listen(PORT, () => {
        const timestamp = new Date().toISOString();
        logger.info(JSON.stringify({
            timestamp,
            level: "info",
            event: "server_started",
            port: PORT,
            protocol: "HTTP",
            message: "Markmap Stateless Server started successfully"
        }));
    });

    server.on("error", (error) => {
        const timestamp = new Date().toISOString();
        logger.error(JSON.stringify({
            timestamp,
            level: "error",
            event: "server_start_error",
            message: "Error starting Markmap Stateless Server",
            error: error instanceof Error ? error.message : String(error)
        }));
    });

    // Handle server shutdown
    process.on("SIGINT", () => {
        const timestamp = new Date().toISOString();
        logger.info(JSON.stringify({
            timestamp,
            level: "info",
            event: "shutdown_initiated",
            signal: "SIGINT",
            message: "Shutting down Markmap Stateless Server..."
        }));
        logger.info(JSON.stringify({
            timestamp,
            level: "info",
            event: "server_shutdown_complete",
            message: "Markmap Stateless Server shutdown complete"
        }));
        process.exit(0);
    });
}

main().catch((error) => {
    logger.error("Failed to start Markmap Stateless Server: %s", error);
    process.exit(1);
});
