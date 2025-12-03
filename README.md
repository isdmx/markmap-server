# Markmap Stateless Server

![Sample Mindmap](https://raw.githubusercontent.com/isdmx/markmap-mcp-server/refs/heads/master/docs/markmap.svg)

[![NPM Version](https://img.shields.io/npm/v/@isdmx/markmap-stateless-server.svg)](https://www.npmjs.com/package/@isdmx/markmap-stateless-server)
[![GitHub License](https://img.shields.io/github/license/isdmx/markmap-mcp-server.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/isdmx/markmap-mcp-server)](https://github.com/isdmx/markmap-mcp-server)

Markmap Stateless Server is a lightweight, stateless web application that allows one-click conversion of Markdown text to interactive mind maps, built on the open source project [markmap](https://github.com/markmap/markmap). The generated mind maps support rich interactive operations and can be exported in various image formats.

> 🎉 **Explore More Mind Mapping Tools**
>
> Try [MarkXMind](https://github.com/isdmx/markxmind) - An online editor that creates complex mind maps using simple XMindMark syntax. It supports real-time preview, multi-format export (.xmind/.svg/.png), importing existing XMind files. [Try it now](https://markxmind.js.org/)!

## Features

- 🌠 **Markdown to Mind Map**: Convert Markdown text to interactive mind maps
- 🖼️ **Multi-format Export**: Support for exporting as PNG, JPG, and SVG images
- 🔄 **Interactive Operations**: Support for zooming, expanding/collapsing nodes, and other interactive features
- 📋 **Markdown Copy**: One-click copy of the original Markdown content
- 🌐 **Stateless Architecture**: No session management required, making it suitable for containerized deployments
- 📡 **JSON-RPC 2.0 Compatible**: Supports both direct and MCP-style request formats

## Prerequisites

1. Node.js (v25)

## Installation

### Manual Installation

```bash
# Install from npm
npm install @isdmx/markmap-stateless-server -g

# Basic run
npx -y @isdmx/markmap-stateless-server

# Specify output directory
npx -y @isdmx/markmap-stateless-server --output /path/to/output/directory

# Or
markmap-stateless-server
```

Alternatively, you can clone the repository and run locally:

```bash
# Clone the repository
git clone https://github.com/isdmx/markmap-mcp-server.git

# Navigate to the project directory
cd markmap-mcp-server

# Build project
npm install && npm run build

# Run the server
node build/index.js
```

## Usage

### API Endpoint

The server provides a single endpoint for markdown to HTML conversion:

- **Endpoint**: `POST /convert`
- **Content-Type**: `application/json`
- **Port**: 3000 (default)

### Request Formats

The server accepts multiple request formats for flexibility:

#### Simple Format
```json
{
  "markdown": "# Your markdown content here\n- Item 1\n- Item 2"
}
```

#### MCP-Style JSON-RPC Format (for backward compatibility)
```json
{
  "jsonrpc": "2.0",
  "method": "tools/markdown_to_mindmap",
  "params": {
    "markdown": "# Your markdown content here\n- Item 1\n- Item 2"
  },
  "id": 1
}
```

### Example Requests

Using curl:

```bash
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -d '{
    "markdown": "# Sample Mind Map\n- Node 1\n- Node 2\n  - Subnode 2.1"
  }'
```

Or with MCP-style format:

```bash
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/markdown_to_mindmap",
    "params": {
      "markdown": "# Sample Mind Map\n- Node 1\n- Node 2\n  - Subnode 2.1"
    },
    "id": 1
  }'
```

### Response Format

The server returns responses in JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "<!DOCTYPE html>..." // Full HTML content
      }
    ],
    "structuredContent": {
      "html": "<!DOCTYPE html>...", // Full HTML content
      "contentLength": 8618, // Length of HTML content
      "success": true
    }
  },
  "id": 1 // Request ID if provided
}
```

### Error Responses

Error responses follow JSON-RPC 2.0 error format:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602, // JSON-RPC error code
    "message": "Error description"
  },
  "id": null
}
```

## Health Check

The server provides standard health check endpoints:

- **Endpoint**: `GET /`
- **Response**: Status information about the server

```bash
curl http://localhost:3000/
```

### Kubernetes Health Endpoints

For Kubernetes deployments, the server provides standard health check endpoints:

- **Health Endpoint**: `GET /healthz`
- **Ready Endpoint**: `GET /readyz`

These endpoints return a 200 status code when the server is healthy/ready, making them suitable for Kubernetes liveness and readiness probes:

```bash
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
```

## Configuration

### Command Line Options

- `--output, -o <path>`: Output directory for generated HTML files (optional)
- `--help, -h`: Show help information

## Docker Deployment

You can also run the server using Docker:

```bash
# Build the image
docker build -t markmap-stateless-server .

# Run the server
docker run -p 3000:3000 markmap-stateless-server
```

## License

This project is licensed under the [MIT](./LICENSE) License.
