const stubElement = () => ({
    classList: { add: () => {}, remove: () => {}, toggle: () => false, contains: () => false },
    appendChild: () => {},
    setAttribute: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    remove: () => {},
    style: { setProperty: () => {} },
    dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    innerText: '',
    textContent: ''
});

globalThis.document ??= {
    createElement: stubElement,
    getElementById: () => stubElement(),
    querySelector: () => stubElement(),
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: stubElement()
};

globalThis.window ??= {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    document: globalThis.document
};
