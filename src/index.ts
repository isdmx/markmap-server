#!/usr/bin/env node
import express, { Request as ExpressRequest, Response as ExpressResponse } from "express";
import cors from "cors";
import { createMarkmap } from "./markmap/createMarkmap.js";
import minimist from "minimist";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import logger from "./utils/logger.js";
import client from "prom-client";

/**
 * Parses and validates command line arguments for the Markmap Server.
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
        logger.info(`Markmap Server - Mind map generator for Markdown

  Usage: markmap-server [options]

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
 * Main function that initializes and starts the Markmap Server.
 * This function sets up HTTP endpoint on port 3000 for converting markdown to HTML.
 */
async function main() {
    const options = parseArgs();

    // Set up Prometheus metrics
    const documentsProcessed = new client.Counter({
        name: 'documents_processed_total',
        help: 'Total number of documents processed'
    });

    const processingTime = new client.Histogram({
        name: 'document_processing_time_seconds',
        help: 'Time spent processing documents',
        buckets: [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1] // Define custom buckets in seconds for realistic processing times
    });

    const inputDocumentSize = new client.Histogram({
        name: 'input_document_size_bytes',
        help: 'Size of input documents in bytes',
        buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000] // Define custom buckets for document size
    });

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

    // POST endpoint to convert markdown to HTML
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

            // Record input document size metric
            inputDocumentSize.observe(Buffer.byteLength(markdown, 'utf8'));

            // Start timing the processing
            const startTime = Date.now();

            // Convert markdown to HTML
            const result = await createMarkmap({
                content: markdown,
                output: options.output ? join(outputPath, `markmap-${Date.now()}.html`) : undefined,
                openIt: false
            });

            // Calculate processing time and record it
            const processingDuration = (Date.now() - startTime) / 1000; // Convert to seconds
            processingTime.observe(processingDuration);

            // Record that a document was processed
            documentsProcessed.inc();

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
            message: "Markmap Server is running",
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

    // Prometheus metrics endpoint
    app.get("/metrics", async (req: ExpressRequest, res: ExpressResponse) => {
        try {
            res.set('Content-Type', client.register.contentType);
            res.end(await client.register.metrics());
        } catch (ex) {
            res.status(500).end(ex);
        }
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
            message: "Markmap Server started successfully"
        }));
    });

    server.on("error", (error) => {
        const timestamp = new Date().toISOString();
        logger.error(JSON.stringify({
            timestamp,
            level: "error",
            event: "server_start_error",
            message: "Error starting Markmap Server",
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
            message: "Shutting down Markmap Server..."
        }));
        logger.info(JSON.stringify({
            timestamp,
            level: "info",
            event: "server_shutdown_complete",
            message: "Markmap Server shutdown complete"
        }));
        process.exit(0);
    });
}

main().catch((error) => {
    logger.error("Failed to start Markmap Server: %s", error);
    process.exit(1);
});
