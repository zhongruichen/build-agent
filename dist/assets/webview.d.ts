// WebView API Type Declarations

// VS Code WebView API
declare function acquireVsCodeApi(): {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
};

// Highlight.js
declare const hljs: {
    highlightElement(element: HTMLElement): void;
    highlight(code: string, options: { language: string }): { value: string };
    listLanguages(): string[];
};

// VSCode WebView module
declare module 'vscode-webview' {
    export interface WebviewApi {
        postMessage(message: any): void;
        getState(): any;
        setState(state: any): void;
    }
}

// UI Enhancements global
interface Window {
    UIEnhancements: {
        showNotification(message: string, type?: string, duration?: number): void;
        hideNotification(notification: HTMLElement): void;
        success(message: string): void;
        error(message: string): void;
        warning(message: string): void;
        info(message: string): void;
        addRipple(button: HTMLElement, event: MouseEvent): void;
        setTheme(theme: string): void;
        animateProgressBar(progressBar: HTMLElement, value: number): void;
        validateField(field: HTMLElement): boolean;
        showError(field: HTMLElement, message: string): void;
        clearError(field: HTMLElement): void;
        toggleError(field: HTMLElement): void;
        initTooltips(): void;
        initTaskItems(): void;
        updateTask(id: string, element: HTMLElement): void;
        setTaskStatus(id: string, status: string): void;
    };
}

// Extended HTML Element types for common properties
interface HTMLInputElement {
    value: string;
    checked: boolean;
    disabled: boolean;
}

interface HTMLButtonElement {
    disabled: boolean;
    click(): void;
}

interface HTMLTextAreaElement {
    value: string;
    disabled: boolean;
}

interface CSSStyleRule extends CSSRule {
    selectorText: string;
    style: CSSStyleDeclaration;
}