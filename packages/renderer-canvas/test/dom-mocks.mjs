class FakeEventTarget {
  #listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    this.#listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  dispatchEvent(event) {
    if (event.target === undefined) {
      event.target = this;
    }
    event.currentTarget = this;
    for (const listener of [...(this.#listeners.get(event.type) ?? [])]) {
      if (typeof listener === 'function') {
        listener.call(this, event);
      } else {
        listener.handleEvent(event);
      }
    }
    return !event.defaultPrevented;
  }

  listenerCount() {
    let count = 0;
    for (const listeners of this.#listeners.values()) {
      count += listeners.length;
    }
    return count;
  }
}

class FakeStyle {
  setProperty(property, value) {
    if (/[A-Z]/.test(property)) {
      return;
    }
    const normalized = property.replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase(),
    );
    this[normalized] = value;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.id = '';
    this.textContent = '';
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this.hidden = false;
    this.value = '';
    this.disabled = false;
    this.readOnly = false;
    this.pointerCaptures = new Set();
  }

  appendChild(child) {
    if (child.parentNode !== null) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.children) {
      child.parentNode = null;
    }
    this.children = [];
    for (const child of children) {
      this.appendChild(child);
    }
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') {
      this.id = String(value);
    }
  }

  getAttribute(name) {
    if (name === 'id' && this.id !== '') {
      return this.id;
    }
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return name === 'id' ? this.id !== '' : this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') {
      this.id = '';
    }
  }

  focus() {
    const previous = this.ownerDocument.activeElement;
    if (previous !== this) {
      this.ownerDocument.activeElement = this;
      previous?.dispatchEvent(fakeEvent('blur'));
      this.dispatchEvent(fakeEvent('focus'));
    }
  }

  select() {
    this.selected = true;
  }

  setPointerCapture(pointerId) {
    this.pointerCaptures.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.pointerCaptures.delete(pointerId);
  }

  hasPointerCapture(pointerId) {
    return this.pointerCaptures.has(pointerId);
  }

  getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
      width: this.clientWidth,
      height: this.clientHeight,
      toJSON() {
        return {};
      },
    };
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const stack = [...this.children].reverse();
    while (stack.length > 0) {
      const candidate = stack.pop();
      if (matchesSelector(candidate, selector)) {
        matches.push(candidate);
      }
      for (let index = candidate.children.length - 1; index >= 0; index -= 1) {
        stack.push(candidate.children[index]);
      }
    }
    return matches;
  }
}

class FakeCanvasContext {
  setTransform() {}
  clearRect() {}
  fillRect() {}
  strokeRect() {}
  beginPath() {}
  closePath() {}
  rect() {}
  clip() {}
  save() {}
  restore() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fillText() {}
}

class FakeCanvasElement extends FakeElement {
  constructor(ownerDocument) {
    super('canvas', ownerDocument);
    this.width = 300;
    this.height = 150;
    this.context = new FakeCanvasContext();
  }

  getContext(kind) {
    return kind === '2d' ? this.context : null;
  }
}

class FakeDocument {
  constructor() {
    this.defaultView = null;
    this.activeElement = null;
    this.fonts = { ready: Promise.resolve() };
  }

  createElement(tagName) {
    return tagName.toLowerCase() === 'canvas'
      ? new FakeCanvasElement(this)
      : new FakeElement(tagName, this);
  }
}

class FakeWindow extends FakeEventTarget {
  #nextFrameId = 1;
  #frames = new Map();

  constructor(document) {
    super();
    this.document = document;
    this.devicePixelRatio = 2;
    this.observers = [];
    const observers = this.observers;
    this.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        this.targets = [];
        observers.push(this);
      }

      observe(target) {
        this.targets.push(target);
      }

      disconnect() {
        this.disconnected = true;
        this.targets = [];
      }
    };
  }

  requestAnimationFrame(callback) {
    const id = this.#nextFrameId++;
    this.#frames.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id) {
    this.#frames.delete(id);
  }

  flushAnimationFrames(timestamp = 16) {
    const frames = [...this.#frames.entries()];
    this.#frames.clear();
    for (const [, callback] of frames) {
      callback(timestamp);
    }
  }

  pendingAnimationFrames() {
    return this.#frames.size;
  }
}

export function createFakeDom(width = 800, height = 320) {
  const document = new FakeDocument();
  const window = new FakeWindow(document);
  document.defaultView = window;
  const container = document.createElement('div');
  container.clientWidth = width;
  container.clientHeight = height;
  return { document, window, container };
}

export function fakeEvent(type, properties = {}) {
  return {
    type,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...properties,
  };
}

function matchesSelector(element, selector) {
  if (selector.startsWith('#')) {
    return element.id === selector.slice(1);
  }
  const compound = selector.match(/^([a-z]+)(\[.+\])$/i);
  if (compound !== null) {
    return (
      element.tagName === compound[1].toUpperCase() &&
      matchesAttribute(element, compound[2])
    );
  }
  if (selector.startsWith('[')) {
    return matchesAttribute(element, selector);
  }
  return element.tagName === selector.toUpperCase();
}

function matchesAttribute(element, selector) {
  const match = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (match === null) {
    return false;
  }
  const [, name, expected] = match;
  if (!element.hasAttribute(name)) {
    return false;
  }
  return expected === undefined || element.getAttribute(name) === expected;
}
