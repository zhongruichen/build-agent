const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * @typedef {import('../config').ModelConfig} ModelConfig
 */

/**
 * @typedef {object} ChatMessage
 * @property {'system' | 'user' | 'assistant'} role
 * @property {string} content
 */

const PROVIDER_BASE_URLS = {
    'Groq': 'https://api.groq.com/openai',
    'Together': 'https://api.together.ai',
    'Ollama': 'http://localhost:11434',
    'OpenAI': 'https://api.openai.com'
};

/**
 * A provider class for making chat completion requests to an OpenAI-compatible API.
 */
class OpenAICompatibleProvider {
    /**
     * @param {ModelConfig} modelConfig The configuration for the model, including apiKey, baseUrl, etc.
     */
    constructor(modelConfig) {
        /** @type {ModelConfig} */
        this.modelConfig = { ...modelConfig }; // Create a copy
        // If baseUrl is not provided by the user, set it based on the provider.
        // @ts-ignore
        if (!this.modelConfig.baseUrl && PROVIDER_BASE_URLS[this.modelConfig.provider]) {
            // @ts-ignore
            this.modelConfig.baseUrl = PROVIDER_BASE_URLS[this.modelConfig.provider];
        }
    }

    /**
     * Makes a chat completion request.
     * @param {ChatMessage[]} messages The array of message objects.
     * @param {boolean} [jsonMode=false] Whether to enable JSON mode.
     * @param {(chunk: string) => void} [onStreamChunk] A callback for handling streaming chunks.
     * @returns {Promise<string>} The full content of the assistant's response.
     */
    async chatCompletion(messages, jsonMode = false, onStreamChunk = undefined) {
        const { apiKey, baseUrl, modelName } = this.modelConfig;

        const url = new URL(baseUrl || 'https://api.openai.com');
        url.pathname = url.pathname.replace(/\/v1\/?$/, '') + '/v1/chat/completions';

        /** @type {any} */
        const requestBody = {
            model: modelName,
            messages: messages,
        };

        if (jsonMode) {
            requestBody.response_format = { type: 'json_object' };
        }

        const useStream = !!onStreamChunk;
        if (useStream) {
            requestBody.stream = true;
        }

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
        };

        const transport = url.protocol === 'http:' ? http : https;

        return new Promise((resolve, reject) => {
            const req = transport.request(options, (res) => {
                let fullContent = '';

                if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300) {
                    let errorData = '';
                    res.on('data', (/** @type {any} */ chunk) => errorData += chunk);
                    res.on('end', () => reject(new Error(`API request failed with status ${res.statusCode}: ${errorData}`)));
                    return;
                }

                res.on('data', (/** @type {any} */ chunk) => {
                    const chunkStr = chunk.toString();
                    if (useStream && onStreamChunk) {
                        const lines = chunkStr.split('\n').filter((/** @type {string} */ line) => line.trim() !== '');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const dataStr = line.substring(6);
                                if (dataStr === '[DONE]') {
                                    return;
                                }
                                try {
                                    const data = JSON.parse(dataStr);
                                    const deltaContent = data.choices[0]?.delta?.content;
                                    if (deltaContent) {
                                        fullContent += deltaContent;
                                        onStreamChunk(deltaContent);
                                    }
                                } catch (_) {
                                    // Ignore parsing errors for non-JSON chunks
                                }
                            }
                        }
                    } else {
                        fullContent += chunkStr;
                    }
                });

                res.on('end', () => {
                    if (useStream) {
                        resolve(fullContent);
                    } else {
                        try {
                            const responseJson = JSON.parse(fullContent);
                            const content = responseJson.choices[0]?.message?.content;
                            if (content) {
                                resolve(content);
                            } else {
                                reject(new Error('API response did not contain valid content.'));
                            }
                        } catch (e) {
                            reject(new Error(`Failed to parse API response: ${e instanceof Error ? e.message : String(e)}`));
                        }
                    }
                });
            });

            req.on('error', (/** @type {Error} */ e) => {
                reject(new Error(`API request error: ${e.message}`));
            });

            req.write(JSON.stringify(requestBody));
            req.end();
        });
    }
}

module.exports = { OpenAICompatibleProvider };
