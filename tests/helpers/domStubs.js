/**
 * Creates a lightweight DOM-like element stub for unit tests.
 * @param {string} [tag='div'] - HTML tag name to assign to the stub element.
 * @returns {object} Minimal element stub with DOM-like properties and methods.
 */
export function createStubElement(tag = 'div') {
    const attributes = new Map();
    const element = {
        tag,
        children: [],
        className: '',
        style: {},
        _innerHTML: '',
        innerText: '',
        addEventListener() {},
        appendChild(child) { this.children.push(child); },
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name); }
    };

    element.classList = {
        _list: new Set(),
        add(...tokens) { tokens.forEach((token) => element.classList._list.add(token)); element.className = Array.from(element.classList._list).join(' '); },
        remove(...tokens) { tokens.forEach((token) => element.classList._list.delete(token)); element.className = Array.from(element.classList._list).join(' '); },
        toggle(token, force) {
            const shouldAdd = typeof force === 'boolean' ? force : !element.classList._list.has(token);
            if (shouldAdd) element.classList._list.add(token);
            else element.classList._list.delete(token);
            element.className = Array.from(element.classList._list).join(' ');
            return element.classList._list.has(token);
        },
        contains(token) { return element.classList._list.has(token); }
    };

    Object.defineProperty(element, 'innerHTML', {
        get() { return this._innerHTML; },
        set(value) {
            this._innerHTML = value;
            if (value === '') this.children = [];
        }
    });

    return element;
}

/**
 * Creates a minimal document stub with registration helpers for unit tests.
 * @returns {object} Minimal document stub that can create and fetch stub elements.
 */
export function createStubDocument() {
    const elements = new Map();
    const listeners = {};
    const document = {
        createElement: (tag) => createStubElement(tag),
        getElementById: (id) => elements.get(id) || null,
        querySelectorAll: () => [],
        listeners,
        addEventListener: (type, listener) => {
            listeners[type] = listeners[type] || [];
            listeners[type].push(listener);
        },
        register: (id, el = createStubElement()) => { elements.set(id, el); return el; }
    };
    document.body = document.register('body');
    document.activeElement = document.body;
    return document;
}
