const EventEmitter = require('events');
const { Readable, Transform } = require('stream');

/**
 * Enhanced MCP Server with streaming capabilities
 * Supports SSE, WebSocket, and chunked transfer
 */
class StreamingMCPServer extends EventEmitter {
    /**
     * @param {object} [options]
     * @param {number} [options.chunkSize]
     * @param {number} [options.highWaterMark]
     * @param {number} [options.streamTimeout]
     * @param {boolean} [options.compressionEnabled]
     */
    constructor(options = {}) {
        super();
        
        this.config = {
            chunkSize: options.chunkSize || 1024 * 4, // 4KB chunks
            highWaterMark: options.highWaterMark || 1024 * 16, // 16KB buffer
            streamTimeout: options.streamTimeout || 30000, // 30s timeout
            compressionEnabled: options.compressionEnabled !== false
        };
        
        this.activeStreams = new Map();
        this.streamMetrics = {
            totalStreams: 0,
            activeStreams: 0,
            bytesTransferred: 0,
            errors: 0
        };
    }
    
    /**
     * Create a streaming response for a tool execution
     * @param {string} toolName - Tool name
     * @param {Object} params - Tool parameters
     * @returns {Readable} Node.js readable stream
     */
    createToolStream(toolName, params) {
        const streamId = this.generateStreamId();
        
        // Create a transform stream for processing
        const stream = new Transform({
            objectMode: true,
            highWaterMark: this.config.highWaterMark,
            
            transform(chunk, encoding, callback) {
                try {
                    // Format chunk as MCP streaming response
                    const response = {
                        jsonrpc: '2.0',
                        method: 'tool/stream',
                        params: {
                            streamId,
                            toolName,
                            chunk: chunk,
                            timestamp: Date.now()
                        }
                    };
                    
                    this.push(JSON.stringify(response) + '\n');
                    callback();
                } catch (error) {
                    callback(/** @type {Error} */ (error));
                }
            }
        });
        
        // Track stream
        this.activeStreams.set(streamId, {
            stream,
            toolName,
            startTime: Date.now(),
            bytesTransferred: 0
        });
        
        this.streamMetrics.totalStreams++;
        this.streamMetrics.activeStreams++;
        
        // Handle stream events
        stream.on('end', () => this.handleStreamEnd(streamId));
        stream.on('error', (error) => this.handleStreamError(streamId, error));
        
        // Set timeout
        const timeout = setTimeout(() => {
            // @ts-ignore
            this.closeStream(streamId, new Error('Stream timeout'));
        }, this.config.streamTimeout);
        
        stream.on('end', () => clearTimeout(timeout));
        
        return stream;
    }
    
    /**
     * Enable Server-Sent Events (SSE) support
     * @param {Object} response - HTTP response object
     */
    /**
     * @param {any} response
     */
    enableSSE(response) {
        response.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // Disable Nginx buffering
        });
        
        // Send initial connection event
        response.write('event: connected\n');
        response.write(`data: ${JSON.stringify({ status: 'connected', timestamp: Date.now() })}\n\n`);
        
        // Keep-alive mechanism
        const keepAlive = setInterval(() => {
            response.write(':keep-alive\n\n');
        }, 15000);
        
        response.on('close', () => {
            clearInterval(keepAlive);
            this.emit('sse:disconnected');
        });
        
        return {
            /**
             * @param {any} event
             * @param {any} data
             */
            send: (event, data) => {
                response.write(`event: ${event}\n`);
                response.write(`data: ${JSON.stringify(data)}\n\n`);
            },
            
            /**
             * @param {any} data
             */
            sendRaw: (data) => {
                response.write(`data: ${data}\n\n`);
            },
            
            close: () => {
                clearInterval(keepAlive);
                response.end();
            }
        };
    }
    
    /**
     * Enable WebSocket support for bidirectional streaming
     * @param {WebSocket} ws - WebSocket connection
     */
    /**
     * @param {any} ws
     */
    enableWebSocket(ws) {
        const clientId = this.generateStreamId();
       
        ws.on('message', async (/** @type {any} */ message) => {
            try {
                const request = JSON.parse(message.toString());
               
                if (request.method === 'tool/stream') {
                    const stream = this.createToolStream(
                        request.params.toolName,
                        request.params.arguments
                    );
                   
                    stream.on('data', (chunk) => {
                        if (ws.readyState === ws.OPEN) {
                            ws.send(chunk);
                        }
                    });
                   
                    stream.on('end', () => {
                        // @ts-ignore
                        const streamId = stream.streamId;
                        ws.send(JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'stream/complete',
                            params: { streamId }
                        }));
                    });
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                ws.send(JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                        code: -32700,
                        message: 'Parse error',
                        data: errorMessage
                    }
                }));
            }
        });
       
        ws.on('close', () => {
            this.emit('ws:disconnected', clientId);
        });
       
        ws.on('error', (/** @type {any} */ error) => {
            this.emit('ws:error', { clientId, error });
        });
        
        // Send connection acknowledgment
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'connected',
            params: { clientId, timestamp: Date.now() }
        }));
    }
    
    /**
     * Enable chunked transfer for large responses
     * @param {Readable} source - Source stream
     * @param {Object} options - Chunking options
     * @returns {Readable} Chunked stream
     */
    /**
     * @param {Readable} source
     * @param {object} [options]
     * @param {number} [options.chunkSize]
     * @param {number} [options.totalSize]
     */
    enableChunkedTransfer(source, options = {}) {
        const chunkSize = options.chunkSize || this.config.chunkSize;
        const totalSize = options.totalSize || 0;
        let chunkIndex = 0;
        let bytesProcessed = 0;
        
        const chunkedStream = new Transform({
            transform(data, encoding, callback) {
                const chunks = [];
                let offset = 0;
                
                while (offset < data.length) {
                    const chunk = data.slice(offset, offset + chunkSize);
                    chunks.push({
                        index: chunkIndex++,
                        data: chunk.toString('base64'),
                        size: chunk.length,
                        total: totalSize,
                        progress: totalSize ? (bytesProcessed / totalSize) : undefined
                    });
                    
                    offset += chunkSize;
                    bytesProcessed += chunk.length;
                }
                
                // Send chunks as separate messages
                chunks.forEach(chunk => {
                    this.push(JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'chunk',
                        params: chunk
                    }) + '\n');
                });
                
                callback();
            }
        });
        
        source.pipe(chunkedStream);
        
        return chunkedStream;
    }
    
    /**
     * Handle stream end
     * @param {any} streamId
     * @private
      */
     handleStreamEnd(streamId) {
         const streamInfo = this.activeStreams.get(streamId);
         if (streamInfo) {
             const duration = Date.now() - streamInfo.startTime;
             this.emit('stream:end', {
                 streamId,
                 toolName: streamInfo.toolName,
                 duration,
                 bytesTransferred: streamInfo.bytesTransferred
             });
            
             this.activeStreams.delete(streamId);
             this.streamMetrics.activeStreams--;
         }
     }
    
    /**
     * Handle stream error
     * @param {any} streamId
     * @param {any} error
     * @private
      */
     handleStreamError(streamId, error) {
         this.streamMetrics.errors++;
         this.emit('stream:error', { streamId, error });
         this.closeStream(streamId, error);
     }
    
    /**
     * Close a stream
     * @param {any} streamId
     * @param {Error | null} [error]
     * @private
      */
     closeStream(streamId, error = null) {
         const streamInfo = this.activeStreams.get(streamId);
         if (streamInfo && streamInfo.stream) {
             if (error) {
                 streamInfo.stream.destroy(error);
             } else {
                 streamInfo.stream.end();
             }
             this.activeStreams.delete(streamId);
             this.streamMetrics.activeStreams--;
         }
     }
    
    /**
     * Generate unique stream ID
     * @private
     */
    generateStreamId() {
        return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get streaming metrics
     */
    getMetrics() {
        return {
            ...this.streamMetrics,
            streams: Array.from(this.activeStreams.entries()).map(([id, info]) => ({
                id,
                toolName: info.toolName,
                duration: Date.now() - info.startTime,
                bytesTransferred: info.bytesTransferred
            }))
        };
    }
}

module.exports = { StreamingMCPServer };