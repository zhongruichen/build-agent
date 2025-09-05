"use strict";
// @ts-nocheck
(function () {
    /** @type {import('vscode-webview').VsCodeApi} */
    const vscode = acquireVsCodeApi();
    // --- STATE ---
    let serviceProviders = [];
    let defaultProviderId = null;
    let defaultModelId = null;
    let currentEditingProviderId = null;
    let currentEditingModelId = null;
    // --- DOM ELEMENTS ---
    let addProviderBtn, providerListContainer, modelParamsModal, modelParamsTitle;
    let tempInput, maxTokensInput, systemPromptInput;
    let saveParamsBtn, resetParamsBtn, cancelParamsBtn;
    // Thinking Config DOM Elements
    let thinkingPreset, thinkingCustomSettings, thinkingDepth, thinkingIterate, thinkingModel, thinkingFocus;
    let thinkingVisualize, thinkingSuggest, thinkingParallel, thinkingTrace, thinkingConfidence, thinkingCritique;
    /**
     * @typedef {object} ThinkingConfig
     * @property {string} [preset]
     * @property {number} [depth]
     * @property {number} [iterate]
     * @property {string} [model]
     * @property {string} [focus]
     * @property {boolean} [visualize]
     * @property {boolean} [suggest]
     * @property {boolean} [parallel]
     * @property {boolean} [trace]
     * @property {boolean} [confidence]
     * @property {boolean} [critique]
     */
    /**
     * @typedef {object} ModelParameters
     * @property {number} [temperature]
     * @property {number} [max_tokens]
     * @property {string} [system_prompt]
     * @property {ThinkingConfig} [thinkingConfig]
     */
    /**
     * @typedef {object} Model
     * @property {string} id
     * @property {boolean} isManual
     * @property {ModelParameters} parameters
     */
    /**
     * @typedef {object} ServiceProvider
     * @property {string} id
     * @property {string} name
     * @property {string} baseUrl
     * @property {string} apiKey
     * @property {Model[]} models
     */
    const thinkingPresets = {
        'default': { visualize: true },
        'deep': { depth: 20, iterate: 5, visualize: true, suggest: true, confidence: true, critique: true },
        'top': { depth: 30, iterate: 10, model: 'all', focus: 'all', visualize: true, suggest: true, parallel: true, trace: true, confidence: true, critique: true }
    };
    // --- INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', () => {
        // Cache DOM elements
        providerListContainer = document.getElementById('service-provider-list-container');
        addProviderBtn = document.getElementById('add-provider-btn');
        modelParamsModal = document.getElementById('model-params-modal');
        modelParamsTitle = document.getElementById('model-params-title');
        tempInput = document.getElementById('param-temperature');
        maxTokensInput = document.getElementById('param-max-tokens');
        systemPromptInput = document.getElementById('param-system-prompt');
        saveParamsBtn = document.getElementById('save-model-params-btn');
        resetParamsBtn = document.getElementById('reset-model-params-btn');
        cancelParamsBtn = document.getElementById('cancel-model-params-btn');
        // Thinking Config DOM Elements
        thinkingPreset = document.getElementById('thinking-preset');
        thinkingCustomSettings = document.getElementById('thinking-custom-settings');
        thinkingDepth = document.getElementById('thinking-depth');
        thinkingIterate = document.getElementById('thinking-iterate');
        thinkingModel = document.getElementById('thinking-model');
        thinkingFocus = document.getElementById('thinking-focus');
        thinkingVisualize = document.getElementById('thinking-visualize');
        thinkingSuggest = document.getElementById('thinking-suggest');
        thinkingParallel = document.getElementById('thinking-parallel');
        thinkingTrace = document.getElementById('thinking-trace');
        thinkingConfidence = document.getElementById('thinking-confidence');
        thinkingCritique = document.getElementById('thinking-critique');
        // Initial data request
        vscode.postMessage({ command: 'getServiceProviders' });
        // Setup event listeners
        addProviderBtn.addEventListener('click', handleAddProvider);
        providerListContainer.addEventListener('click', handleProviderListClick);
        saveParamsBtn.addEventListener('click', handleSaveParams);
        resetParamsBtn.addEventListener('click', handleResetParams);
        cancelParamsBtn.addEventListener('click', closeModelParametersModal);
        if (thinkingPreset) {
            thinkingPreset.addEventListener('change', handleThinkingPresetChange);
        }
    });
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'receiveServiceProviders':
                serviceProviders = message.providers;
                defaultProviderId = message.defaults.defaultProviderId;
                defaultModelId = message.defaults.defaultModelId;
                renderServiceProviders();
                const refreshingButtons = document.querySelectorAll('button[data-action="refresh-models"]:disabled');
                refreshingButtons.forEach(btn => {
                    btn.textContent = 'Refresh Models';
                    btn.disabled = false;
                });
                break;
            case 'receiveModelParameters':
                populateAndShowModal(message.params);
                break;
        }
    });
    // --- EVENT HANDLERS ---
    function handleAddProvider() {
        vscode.postMessage({
            command: 'addServiceProvider',
            provider: { name: 'New Custom Provider', baseUrl: 'http://localhost:8080/v1', apiKey: '' }
        });
    }
    function handleProviderListClick(event) {
        const target = event.target;
        if (target.tagName === 'BUTTON' && target.dataset.action) {
            const button = target;
            const providerId = button.dataset.providerId;
            const modelId = button.dataset.modelId;
            const action = button.dataset.action;
            switch (action) {
                case 'delete':
                    vscode.postMessage({ command: 'removeServiceProvider', id: providerId });
                    break;
                case 'refresh-models':
                    button.textContent = 'Refreshing...';
                    button.disabled = true;
                    vscode.postMessage({ command: 'refreshModels', id: providerId });
                    break;
                case 'add-model':
                    const input = button.previousElementSibling;
                    if (input && input.value) {
                        vscode.postMessage({ command: 'addModel', providerId, modelId: input.value });
                        input.value = '';
                    }
                    break;
                case 'configure':
                    openModelParametersModal(providerId, modelId);
                    break;
            }
        }
        if (target.tagName === 'INPUT' && target.type === 'radio' && target.name === 'default-model') {
            const radio = target;
            vscode.postMessage({ command: 'setDefault', providerId: radio.dataset.providerId, modelId: radio.dataset.modelId });
        }
    }
    function handleSaveParams() {
        const params = {
            temperature: parseFloat(tempInput.value) || undefined,
            max_tokens: parseInt(maxTokensInput.value, 10) || undefined,
            system_prompt: systemPromptInput.value || undefined,
            thinkingConfig: getThinkingConfigFromUI(),
        };
        Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
        vscode.postMessage({
            command: 'saveModelParameters',
            providerId: currentEditingProviderId,
            modelId: currentEditingModelId,
            params: params,
        });
        closeModelParametersModal();
    }
    function handleResetParams() {
        vscode.postMessage({
            command: 'resetModelParameters',
            providerId: currentEditingProviderId,
            modelId: currentEditingModelId,
        });
        closeModelParametersModal();
    }
    // --- MODAL LOGIC ---
    function openModelParametersModal(providerId, modelId) {
        currentEditingProviderId = providerId;
        currentEditingModelId = modelId;
        modelParamsTitle.textContent = `Configure Model: ${modelId}`;
        vscode.postMessage({ command: 'getModelParameters', providerId, modelId });
    }
    function populateAndShowModal(params) {
        tempInput.value = params.temperature ?? '';
        maxTokensInput.value = params.max_tokens ?? '';
        systemPromptInput.value = params.system_prompt ?? '';
        renderThinkingConfig(params.thinkingConfig || {});
        modelParamsModal.style.display = 'block';
    }
    function closeModelParametersModal() {
        modelParamsModal.style.display = 'none';
        currentEditingProviderId = null;
        currentEditingModelId = null;
    }
    // --- RENDER FUNCTION ---
    function renderServiceProviders() {
        if (!providerListContainer)
            return;
        providerListContainer.innerHTML = '';
        if (!serviceProviders || serviceProviders.length === 0) {
            providerListContainer.innerHTML = '<p>No service providers configured. Click "Add Service Provider" to begin.</p>';
            return;
        }
        serviceProviders.forEach(provider => {
            const providerElement = document.createElement('div');
            providerElement.className = 'service-provider-item';
            const modelsHtml = provider.models.map(model => {
                const isChecked = provider.id === defaultProviderId && model.id === defaultModelId;
                const isConfigured = model.parameters && Object.keys(model.parameters).length > 0;
                return `
                    <li class="model-item">
                        <div class="model-item-left">
                            <input type="radio" name="default-model" id="model-${provider.id}-${model.id}" 
                                   data-provider-id="${provider.id}" data-model-id="${model.id}" ${isChecked ? 'checked' : ''}>
                            <label for="model-${provider.id}-${model.id}">
                                ${model.id} ${model.isManual ? ' (Manual)' : ''}
                            </label>
                        </div>
                        <button class="button ${isConfigured ? 'configured' : ''}" 
                                data-provider-id="${provider.id}" data-model-id="${model.id}" data-action="configure">Configure</button>
                    </li>
                `;
            }).join('');
            providerElement.innerHTML = `
                <div class="provider-header">
                    <h3>${provider.name}</h3>
                    <div class="provider-actions">
                        <button class="button" data-provider-id="${provider.id}" data-action="delete">Delete</button>
                        <button class="button" data-provider-id="${provider.id}" data-action="refresh-models">Refresh Models</button>
                    </div>
                </div>
                <div class="provider-details">
                    <p><strong>Base URL:</strong> ${provider.baseUrl}</p>
                    <p><strong>API Key:</strong> ${provider.apiKey ? '********' : 'Not Set'}</p>
                </div>
                <div class="models-section">
                    <h4>Models (Select Default)</h4>
                    <ul class="models-list">${modelsHtml}</ul>
                     <div class="add-model-form">
                        <input type="text" placeholder="Add model ID manually" class="model-input">
                        <button class="button" data-provider-id="${provider.id}" data-action="add-model">Add</button>
                    </div>
                </div>
            `;
            providerListContainer.appendChild(providerElement);
        });
    }
    // --- THINKING CONFIG FUNCTIONS ---
    function renderThinkingConfig(config) {
        if (!thinkingPreset)
            return;
        const cfg = config;
        thinkingPreset.value = cfg.preset || 'default';
        thinkingDepth.value = cfg.depth || '';
        thinkingIterate.value = cfg.iterate || '';
        thinkingModel.value = cfg.model || '';
        thinkingFocus.value = cfg.focus || '';
        thinkingVisualize.checked = cfg.visualize ?? true;
        thinkingSuggest.checked = cfg.suggest ?? false;
        thinkingParallel.checked = cfg.parallel ?? false;
        thinkingTrace.checked = cfg.trace ?? false;
        thinkingConfidence.checked = cfg.confidence ?? false;
        thinkingCritique.checked = cfg.critique ?? false;
        handleThinkingPresetChange();
    }
    function handleThinkingPresetChange() {
        const preset = thinkingPreset.value;
        if (preset === 'custom') {
            thinkingCustomSettings.style.display = 'block';
        }
        else {
            thinkingCustomSettings.style.display = 'none';
            const presetConfig = thinkingPresets[preset] || {};
            renderThinkingConfig(presetConfig);
        }
    }
    function getThinkingConfigFromUI() {
        const preset = thinkingPreset.value;
        if (preset !== 'custom') {
            return { preset, ...(thinkingPresets[preset] || {}) };
        }
        return {
            preset: 'custom',
            depth: parseInt(thinkingDepth.value, 10) || undefined,
            iterate: parseInt(thinkingIterate.value, 10) || undefined,
            model: thinkingModel.value || undefined,
            focus: thinkingFocus.value || undefined,
            visualize: thinkingVisualize.checked,
            suggest: thinkingSuggest.checked,
            parallel: thinkingParallel.checked,
            trace: thinkingTrace.checked,
            confidence: thinkingConfidence.checked,
            critique: thinkingCritique.checked,
        };
    }
}());
//# sourceMappingURL=main.js.map