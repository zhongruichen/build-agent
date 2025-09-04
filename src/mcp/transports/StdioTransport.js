const EventEmitter = require('events');
const readline = require('readline');

/**
 * Standard I/O transport for MCP communication
 * Used for process-based communication between client and server
 */
class StdioTransport extends EventEmitter {
    constructor(childProcess = null) {
        super();
        
        this.childProcess = childProcess;
        this.rl = null;
        this.isConnected = false;
    }
    
    /**
     * Initialize the transport
     */
    async initialize() {
        if (this.isConnected) {
            return;
        }
        
        if (this.childProcess) {
            // Client mode - communicating with child process
            this.setupChildProcess();
        } else {
            // Server mode - communicating via stdin/stdout
            this.setupStdio();
        }
        
        this.isConnected = true;
    }
    
    /**
     * Setup communication with child process
     */
    setupChildProcess() {
        if (!this.childProcess) {
            throw new Error('Child process not provided');
        }
        
        // Read from child stdout
        this.rl = readline.createInterface({
            input: this.childProcess.stdout,
            crlfDelay: Infinity
        });
        
        this.rl.on('line', (line) => {
            try {
                const message = JSON.parse(line);
                this.emit('message', message);
            } catch (error) {
                console.error('Failed to parse message:', error);
            }
        });
        
        this.childProcess.on('error', (error) => {
            this.emit('error', error);
        });
        
        this.childProcess.on('exit', (code) => {
            this.isConnected = false;
            this.emit('close', code);
        });
        
        // Handle stderr for logging
        this.childProcess.stderr.on('data', (data) => {
            console.error('Server stderr:', data.toString());
        });
    }
    
    /**
     * Setup standard I/O for server mode
     */
    setupStdio() {
        this.rl = readline.createInterface({
            input: process.stdin,
            crlfDelay: Infinity
        });
        
        this.rl.on('line', (line) => {
            try {
                const message = JSON.parse(line);
                this.emit('message', message);
            } catch (error) {
                console.error('Failed to parse message:', error);
            }
        });
        
        process.stdin.on('error', (error) => {
            this.emit('error', error);
        });
        
        process.stdin.on('end', () => {
            this.isConnected = false;
            this.emit('close');
        });
    }
    
    /**
     * Send a message
     * @param {Object} message - Message to send
     */
    send(message) {
        if (!this.isConnected) {
            throw new Error('Transport is not connected');
        }
        
        const json = JSON.stringify(message);
        
        if (this.childProcess) {
            // Client mode - write to child stdin
            this.childProcess.stdin.write(json + '\n');
        } else {
            // Server mode - write to stdout
            process.stdout.write(json + '\n');
        }
    }
    
    /**
     * Close the transport
     */
    async close() {
        if (!this.isConnected) {
            return;
        }
        
        this.isConnected = false;
        
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
        
        if (this.childProcess) {
            this.childProcess.kill();
            this.childProcess = null;
        }
        
        this.emit('close');
    }
}

module.exports = { StdioTransport };