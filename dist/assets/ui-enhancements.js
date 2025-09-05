/**
 * 🎨 UI增强交互系统
 * 提供流畅的动画、视觉反馈和改进的用户体验
 */

(function() {
    'use strict';

    // ========================================
    // 🎯 通知系统
    // ========================================
    class NotificationSystem {
        constructor() {
            this.container = null;
            this.init();
        }

        init() {
            // 创建通知容器
            this.container = document.createElement('div');
            this.container.className = 'notification-container';
            this.container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: var(--space-3);
                pointer-events: none;
            `;
            document.body.appendChild(this.container);
        }

        show(message, type = 'info', duration = 3000) {
            const notification = document.createElement('div');
            notification.className = `notification ${type} show animate-slide-in`;
            notification.style.cssText = `
                pointer-events: auto;
                min-width: 320px;
                max-width: 420px;
                padding: var(--space-4);
                background: var(--bg-elevated);
                border-radius: var(--radius-xl);
                box-shadow: var(--shadow-xl);
                display: flex;
                align-items: flex-start;
                gap: var(--space-3);
                transform: translateX(0);
                transition: all var(--duration-normal) var(--ease-bounce);
                border-left: 4px solid;
            `;

            // 设置图标和颜色
            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            };

            const colors = {
                success: 'var(--color-success)',
                error: 'var(--color-error)',
                warning: 'var(--color-warning)',
                info: 'var(--color-info)'
            };

            notification.style.borderLeftColor = colors[type];

            notification.innerHTML = `
                <span class="notification-icon" style="font-size: var(--text-xl); color: ${colors[type]}">
                    ${icons[type]}
                </span>
                <div class="notification-content" style="flex: 1;">
                    <div class="notification-message" style="color: var(--text-primary);">
                        ${message}
                    </div>
                </div>
                <button class="notification-close" style="
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: var(--space-1);
                    border-radius: var(--radius-md);
                    transition: all var(--duration-fast);
                ">✕</button>
            `;

            // 添加关闭功能
            const closeBtn = notification.querySelector('.notification-close');
            closeBtn.addEventListener('click', () => this.close(notification));

            // 添加到容器
            this.container.appendChild(notification);

            // 自动关闭
            if (duration > 0) {
                setTimeout(() => this.close(notification), duration);
            }

            return notification;
        }

        close(notification) {
            notification.style.transform = 'translateX(500px)';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }

        success(message) {
            return this.show(message, 'success');
        }

        error(message) {
            return this.show(message, 'error', 5000);
        }

        warning(message) {
            return this.show(message, 'warning', 4000);
        }

        info(message) {
            return this.show(message, 'info');
        }
    }

    // ========================================
    // 🌟 按钮涟漪效果
    // ========================================
    class RippleEffect {
        constructor() {
            this.init();
        }

        init() {
            document.addEventListener('click', (e) => {
                const button = e.target.closest('.btn, button');
                if (button && !button.disabled) {
                    this.createRipple(button, e);
                }
            });
        }

        createRipple(button, event) {
            const ripple = document.createElement('span');
            const rect = button.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = event.clientX - rect.left - size / 2;
            const y = event.clientY - rect.top - size / 2;

            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.5);
                transform: scale(0);
                opacity: 1;
                pointer-events: none;
                left: ${x}px;
                top: ${y}px;
                animation: ripple-animation 0.6s ease-out;
            `;

            // 确保按钮有相对定位
            if (getComputedStyle(button).position === 'static') {
                button.style.position = 'relative';
            }
            button.style.overflow = 'hidden';

            button.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        }
    }

    // ========================================
    // 💫 加载状态管理
    // ========================================
    class LoadingManager {
        constructor() {
            this.loadingCount = 0;
            this.overlay = null;
            this.init();
        }

        init() {
            this.overlay = document.createElement('div');
            this.overlay.className = 'loading-overlay';
            this.overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                opacity: 0;
                visibility: hidden;
                transition: all var(--duration-normal);
            `;

            this.overlay.innerHTML = `
                <div class="loading-content" style="text-align: center;">
                    <div class="loading-spinner" style="
                        width: 48px;
                        height: 48px;
                        border: 4px solid rgba(255, 255, 255, 0.1);
                        border-radius: 50%;
                        border-top-color: var(--brand-primary);
                        animation: spin 1s linear infinite;
                        margin: 0 auto var(--space-4);
                    "></div>
                    <div class="loading-text" style="
                        font-size: var(--text-base);
                        color: var(--text-primary);
                        margin-bottom: var(--space-2);
                    ">处理中...</div>
                    <div class="loading-subtext" style="
                        font-size: var(--text-sm);
                        color: var(--text-secondary);
                    ">请稍候</div>
                </div>
            `;

            document.body.appendChild(this.overlay);
        }

        show(text = '处理中...', subtext = '请稍候') {
            this.loadingCount++;
            const textEl = this.overlay.querySelector('.loading-text');
            const subtextEl = this.overlay.querySelector('.loading-subtext');
            
            if (textEl) textEl.textContent = text;
            if (subtextEl) subtextEl.textContent = subtext;
            
            this.overlay.style.opacity = '1';
            this.overlay.style.visibility = 'visible';
        }

        hide() {
            this.loadingCount--;
            if (this.loadingCount <= 0) {
                this.loadingCount = 0;
                this.overlay.style.opacity = '0';
                this.overlay.style.visibility = 'hidden';
            }
        }
    }

    // ========================================
    // 🎭 平滑滚动
    // ========================================
    class SmoothScroll {
        constructor() {
            this.init();
        }

        init() {
            // 为所有内部链接添加平滑滚动
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', (e) => {
                    e.preventDefault();
                    const target = document.querySelector(anchor.getAttribute('href'));
                    if (target) {
                        target.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                });
            });
        }

        scrollTo(element, offset = 0) {
            const y = element.getBoundingClientRect().top + window.pageYOffset + offset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }

    // ========================================
    // 🎨 主题切换
    // ========================================
    class ThemeManager {
        constructor() {
            this.currentTheme = localStorage.getItem('theme') || 'auto';
            this.init();
        }

        init() {
            this.applyTheme(this.currentTheme);
            
            // 监听系统主题变化
            if (window.matchMedia) {
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                    if (this.currentTheme === 'auto') {
                        this.applyTheme('auto');
                    }
                });
            }
        }

        applyTheme(theme) {
            this.currentTheme = theme;
            localStorage.setItem('theme', theme);
            
            if (theme === 'auto') {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            } else {
                document.documentElement.setAttribute('data-theme', theme);
            }
        }

        toggle() {
            const themes = ['light', 'dark', 'auto'];
            const currentIndex = themes.indexOf(this.currentTheme);
            const nextTheme = themes[(currentIndex + 1) % themes.length];
            this.applyTheme(nextTheme);
            return nextTheme;
        }
    }

    // ========================================
    // 📊 进度条增强
    // ========================================
    class ProgressEnhancer {
        constructor() {
            this.init();
        }

        init() {
            // 为所有进度条添加动画
            this.enhanceProgressBars();
        }

        enhanceProgressBars() {
            document.querySelectorAll('.progress-bar').forEach(bar => {
                if (!bar.dataset.enhanced) {
                    bar.dataset.enhanced = 'true';
                    this.addShimmer(bar);
                }
            });
        }

        addShimmer(bar) {
            const fill = bar.querySelector('.progress-fill');
            if (fill && !fill.querySelector('.shimmer')) {
                const shimmer = document.createElement('div');
                shimmer.className = 'shimmer';
                shimmer.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(
                        90deg,
                        transparent,
                        rgba(255, 255, 255, 0.3),
                        transparent
                    );
                    animation: shimmer 2s infinite;
                `;
                fill.style.position = 'relative';
                fill.appendChild(shimmer);
            }
        }

        update(progressBar, value, animate = true) {
            const fill = progressBar.querySelector('.progress-fill');
            const label = progressBar.parentElement.querySelector('.progress-text');
            
            if (fill) {
                if (animate) {
                    fill.style.transition = 'width var(--duration-normal) var(--ease-out)';
                } else {
                    fill.style.transition = 'none';
                }
                fill.style.width = `${value}%`;
            }
            
            if (label) {
                label.textContent = `${value}%`;
            }
        }
    }

    // ========================================
    // 🎯 表单验证增强
    // ========================================
    class FormValidator {
        constructor() {
            this.init();
        }

        init() {
            // 为所有输入框添加实时验证
            document.querySelectorAll('input, textarea, select').forEach(input => {
                input.addEventListener('blur', () => this.validateField(input));
                input.addEventListener('input', () => this.clearError(input));
            });
        }

        validateField(field) {
            if (field.hasAttribute('required') && !field.value.trim()) {
                this.showError(field, '此字段为必填项');
                return false;
            }
            
            if (field.type === 'email' && field.value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(field.value)) {
                    this.showError(field, '请输入有效的邮箱地址');
                    return false;
                }
            }
            
            if (field.type === 'url' && field.value) {
                try {
                    new URL(field.value);
                } catch {
                    this.showError(field, '请输入有效的URL');
                    return false;
                }
            }
            
            this.showSuccess(field);
            return true;
        }

        showError(field, message) {
            field.classList.add('is-invalid');
            field.classList.remove('is-valid');
            
            let errorEl = field.parentElement.querySelector('.form-error');
            if (!errorEl) {
                errorEl = document.createElement('div');
                errorEl.className = 'form-error form-helper';
                field.parentElement.appendChild(errorEl);
            }
            errorEl.textContent = message;
            
            // 震动效果
            field.style.animation = 'shake 0.5s';
            setTimeout(() => field.style.animation = '', 500);
        }

        showSuccess(field) {
            field.classList.add('is-valid');
            field.classList.remove('is-invalid');
            
            const errorEl = field.parentElement.querySelector('.form-error');
            if (errorEl) {
                errorEl.remove();
            }
        }

        clearError(field) {
            field.classList.remove('is-invalid');
            const errorEl = field.parentElement.querySelector('.form-error');
            if (errorEl) {
                errorEl.remove();
            }
        }
    }

    // ========================================
    // ✨ 工具提示
    // ========================================
    class Tooltip {
        constructor() {
            this.tooltip = null;
            this.init();
        }

        init() {
            this.createTooltip();
            
            // 为所有带有title属性的元素添加工具提示
            document.querySelectorAll('[title]').forEach(element => {
                const title = element.getAttribute('title');
                element.removeAttribute('title');
                element.dataset.tooltip = title;
                
                element.addEventListener('mouseenter', (e) => this.show(e.target));
                element.addEventListener('mouseleave', () => this.hide());
                element.addEventListener('click', () => this.hide());
            });
        }

        createTooltip() {
            this.tooltip = document.createElement('div');
            this.tooltip.className = 'tooltip';
            this.tooltip.style.cssText = `
                position: fixed;
                padding: var(--space-2) var(--space-3);
                background: var(--gray-900);
                color: white;
                font-size: var(--text-sm);
                border-radius: var(--radius-md);
                pointer-events: none;
                z-index: 10001;
                opacity: 0;
                transform: translateY(4px);
                transition: all var(--duration-fast);
                max-width: 250px;
                word-wrap: break-word;
                box-shadow: var(--shadow-lg);
            `;
            document.body.appendChild(this.tooltip);
        }

        show(element) {
            const text = element.dataset.tooltip;
            if (!text) return;
            
            this.tooltip.textContent = text;
            
            const rect = element.getBoundingClientRect();
            const tooltipRect = this.tooltip.getBoundingClientRect();
            
            let top = rect.top - tooltipRect.height - 8;
            let left = rect.left + (rect.width - tooltipRect.width) / 2;
            
            // 确保不超出视口
            if (top < 0) {
                top = rect.bottom + 8;
            }
            if (left < 0) {
                left = 8;
            }
            if (left + tooltipRect.width > window.innerWidth) {
                left = window.innerWidth - tooltipRect.width - 8;
            }
            
            this.tooltip.style.top = `${top}px`;
            this.tooltip.style.left = `${left}px`;
            this.tooltip.style.opacity = '1';
            this.tooltip.style.transform = 'translateY(0)';
        }

        hide() {
            this.tooltip.style.opacity = '0';
            this.tooltip.style.transform = 'translateY(4px)';
        }
    }

    // ========================================
    // 📈 实时状态指示器
    // ========================================
    class StatusIndicator {
        constructor() {
            this.indicators = new Map();
        }

        create(id, element) {
            const indicator = {
                element,
                status: 'idle',
                animation: null
            };
            this.indicators.set(id, indicator);
            return indicator;
        }

        update(id, status) {
            const indicator = this.indicators.get(id);
            if (!indicator) return;
            
            indicator.status = status;
            
            // 清除之前的动画
            if (indicator.animation) {
                indicator.element.style.animation = '';
            }
            
            switch (status) {
                case 'loading':
                    indicator.element.style.animation = 'pulse 2s infinite';
                    indicator.element.style.color = 'var(--color-info)';
                    break;
                case 'success':
                    indicator.element.style.animation = 'bounce 0.5s';
                    indicator.element.style.color = 'var(--color-success)';
                    break;
                case 'error':
                    indicator.element.style.animation = 'shake 0.5s';
                    indicator.element.style.color = 'var(--color-error)';
                    break;
                case 'warning':
                    indicator.element.style.animation = 'pulse 1s';
                    indicator.element.style.color = 'var(--color-warning)';
                    break;
                default:
                    indicator.element.style.animation = '';
                    indicator.element.style.color = 'var(--text-secondary)';
            }
        }
    }

    // ========================================
    // 🎉 初始化
    // ========================================
    window.addEventListener('DOMContentLoaded', () => {
        // 创建全局实例
        window.UIEnhancements = {
            notifications: new NotificationSystem(),
            ripple: new RippleEffect(),
            loading: new LoadingManager(),
            scroll: new SmoothScroll(),
            theme: new ThemeManager(),
            progress: new ProgressEnhancer(),
            validator: new FormValidator(),
            tooltip: new Tooltip(),
            status: new StatusIndicator()
        };

        // 添加必要的CSS动画
        const style = document.createElement('style');
        style.textContent = `
            @keyframes ripple-animation {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
            
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
                20%, 40%, 60%, 80% { transform: translateX(2px); }
            }
            
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-8px); }
            }
            
            @keyframes shimmer {
                0% { left: -100%; }
                100% { left: 100%; }
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            .animate-slide-in {
                animation: slideIn var(--duration-normal) var(--ease-out);
            }
        `;
        document.head.appendChild(style);

        // 测试通知系统
        console.log('✨ UI增强系统已初始化');
        
        // 欢迎消息
        setTimeout(() => {
            window.UIEnhancements.notifications.info('UI增强系统已就绪！');
        }, 500);
    });

})();