import type { OccurrenceId } from '@bom-editor/contracts';

export interface RopeEntry {
  readonly occurrenceId: OccurrenceId;
  readonly rowHeight: number;
}

export class RopeNode {
  readonly occurrenceId: OccurrenceId;
  rowHeight: number;
  left: RopeNode | undefined;
  right: RopeNode | undefined;
  parent: RopeNode | undefined;
  height = 1;
  rowCount = 1;
  pixelSum: number;

  constructor(entry: RopeEntry) {
    this.occurrenceId = entry.occurrenceId;
    this.rowHeight = entry.rowHeight;
    this.pixelSum = entry.rowHeight;
  }
}

interface BuiltRope {
  readonly root: RopeNode | undefined;
  readonly nodes: readonly RopeNode[];
}

interface BuildFrame {
  readonly low: number;
  readonly high: number;
  readonly parent: RopeNode | undefined;
  readonly side: 'left' | 'right' | 'root';
  readonly finalize?: RopeNode;
}

interface SplitFrame {
  readonly pivot: RopeNode;
  readonly side: 'left' | 'right';
  readonly other: RopeNode | undefined;
}

export class ImplicitAvlRope {
  #root: RopeNode | undefined;

  constructor(entries: readonly RopeEntry[] = []) {
    this.#root = buildBalanced(entries).root;
  }

  get rowCount(): number {
    return countOf(this.#root);
  }

  get pixelSum(): number {
    return pixelsOf(this.#root);
  }

  nodes(): readonly RopeNode[] {
    return collectNodes(this.#root);
  }

  nodeAt(index: number): RopeNode | undefined {
    let current = this.#root;
    let remaining = index;
    while (current !== undefined) {
      const leftCount = countOf(current.left);
      if (remaining < leftCount) {
        current = current.left;
      } else if (remaining === leftCount) {
        return current;
      } else {
        remaining -= leftCount + 1;
        current = current.right;
      }
    }
    return undefined;
  }

  nodeAtOffset(offset: number): RopeNode | undefined {
    if (offset < 0 || offset >= this.pixelSum) {
      return undefined;
    }
    let current = this.#root;
    let remaining = offset;
    while (current !== undefined) {
      const leftPixels = pixelsOf(current.left);
      if (remaining < leftPixels) {
        current = current.left;
      } else if (remaining < leftPixels + current.rowHeight) {
        return current;
      } else {
        remaining -= leftPixels + current.rowHeight;
        current = current.right;
      }
    }
    return undefined;
  }

  indexOf(node: RopeNode): number {
    let index = countOf(node.left);
    let current = node;
    while (current.parent !== undefined) {
      if (current === current.parent.right) {
        index += countOf(current.parent.left) + 1;
      }
      current = current.parent;
    }
    return index;
  }

  offsetOf(node: RopeNode): number {
    let offset = pixelsOf(node.left);
    let current = node;
    while (current.parent !== undefined) {
      if (current === current.parent.right) {
        offset += pixelsOf(current.parent.left) + current.parent.rowHeight;
      }
      current = current.parent;
    }
    return offset;
  }

  countStartingBefore(offset: number): number {
    if (offset <= 0) {
      return 0;
    }
    if (offset >= this.pixelSum) {
      return this.rowCount;
    }
    let current = this.#root;
    let prefix = 0;
    let count = 0;
    while (current !== undefined) {
      const leftPixels = pixelsOf(current.left);
      const nodeOffset = prefix + leftPixels;
      if (nodeOffset < offset) {
        count += countOf(current.left) + 1;
        prefix = nodeOffset + current.rowHeight;
        current = current.right;
      } else {
        current = current.left;
      }
    }
    return count;
  }

  insert(index: number, entries: readonly RopeEntry[]): readonly RopeNode[] {
    if (entries.length === 0) {
      return Object.freeze([]);
    }
    const built = buildBalanced(entries);
    const [left, right] = split(this.#root, index);
    this.#root = concatenate(concatenate(left, built.root), right);
    setParent(this.#root, undefined);
    return built.nodes;
  }

  remove(index: number, amount: number): readonly RopeNode[] {
    if (amount === 0) {
      return Object.freeze([]);
    }
    const [left, remainder] = split(this.#root, index);
    const [removed, right] = split(remainder, amount);
    this.#root = concatenate(left, right);
    setParent(this.#root, undefined);
    return collectNodes(removed);
  }

  setRowHeight(node: RopeNode, rowHeight: number): void {
    node.rowHeight = rowHeight;
    let current: RopeNode | undefined = node;
    while (current !== undefined) {
      recalculate(current);
      current = current.parent;
    }
  }

  idsInRange(startIndex: number, endIndex: number): readonly OccurrenceId[] {
    if (startIndex >= endIndex) {
      return Object.freeze([]);
    }
    const ids: OccurrenceId[] = [];
    let current = this.nodeAt(startIndex);
    for (let index = startIndex; index < endIndex && current !== undefined; index += 1) {
      ids.push(current.occurrenceId);
      current = successor(current);
    }
    return Object.freeze(ids);
  }
}

function buildBalanced(entries: readonly RopeEntry[]): BuiltRope {
  if (entries.length === 0) {
    return { root: undefined, nodes: Object.freeze([]) };
  }
  const nodes: RopeNode[] = [];
  let root: RopeNode | undefined;
  const stack: BuildFrame[] = [
    { low: 0, high: entries.length, parent: undefined, side: 'root' },
  ];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.finalize !== undefined) {
      recalculate(frame.finalize);
      continue;
    }
    if (frame.low >= frame.high) {
      continue;
    }
    const middle = frame.low + Math.floor((frame.high - frame.low) / 2);
    const node = new RopeNode(entries[middle]!);
    nodes.push(node);
    if (frame.side === 'root') {
      root = node;
    } else if (frame.side === 'left') {
      frame.parent!.left = node;
      node.parent = frame.parent;
    } else {
      frame.parent!.right = node;
      node.parent = frame.parent;
    }
    stack.push({
      low: 0,
      high: 0,
      parent: undefined,
      side: 'root',
      finalize: node,
    });
    stack.push({ low: middle + 1, high: frame.high, parent: node, side: 'right' });
    stack.push({ low: frame.low, high: middle, parent: node, side: 'left' });
  }
  return { root, nodes: Object.freeze(nodes) };
}

function split(
  root: RopeNode | undefined,
  leftCount: number,
): readonly [RopeNode | undefined, RopeNode | undefined] {
  let current = root;
  let remaining = leftCount;
  const path: SplitFrame[] = [];
  while (current !== undefined) {
    const currentLeft = current.left;
    const currentRight = current.right;
    const currentLeftCount = countOf(currentLeft);
    setParent(currentLeft, undefined);
    setParent(currentRight, undefined);
    current.left = undefined;
    current.right = undefined;
    current.parent = undefined;
    recalculate(current);
    if (remaining <= currentLeftCount) {
      path.push({ pivot: current, side: 'left', other: currentRight });
      current = currentLeft;
    } else {
      path.push({ pivot: current, side: 'right', other: currentLeft });
      remaining -= currentLeftCount + 1;
      current = currentRight;
    }
  }

  let left: RopeNode | undefined;
  let right: RopeNode | undefined;
  while (path.length > 0) {
    const frame = path.pop()!;
    if (frame.side === 'left') {
      right = joinWithPivot(right, frame.pivot, frame.other);
    } else {
      left = joinWithPivot(frame.other, frame.pivot, left);
    }
  }
  return [left, right];
}

function concatenate(
  left: RopeNode | undefined,
  right: RopeNode | undefined,
): RopeNode | undefined {
  if (left === undefined) {
    setParent(right, undefined);
    return right;
  }
  if (right === undefined) {
    setParent(left, undefined);
    return left;
  }
  const [withoutLast, lastTree] = split(left, countOf(left) - 1);
  const pivot = lastTree!;
  return joinWithPivot(withoutLast, pivot, right);
}

function joinWithPivot(
  left: RopeNode | undefined,
  pivot: RopeNode,
  right: RopeNode | undefined,
): RopeNode {
  setParent(left, undefined);
  setParent(right, undefined);
  pivot.left = undefined;
  pivot.right = undefined;
  pivot.parent = undefined;
  recalculate(pivot);
  const leftHeight = heightOf(left);
  const rightHeight = heightOf(right);
  if (leftHeight > rightHeight + 1) {
    let insertionParent = left!;
    while (heightOf(insertionParent.right) > rightHeight + 1) {
      insertionParent = insertionParent.right!;
    }
    const leftTail = insertionParent.right;
    attachLeft(pivot, leftTail);
    attachRight(pivot, right);
    recalculate(pivot);
    attachRight(insertionParent, pivot);
    return rebalanceToRoot(insertionParent);
  }
  if (rightHeight > leftHeight + 1) {
    let insertionParent = right!;
    while (heightOf(insertionParent.left) > leftHeight + 1) {
      insertionParent = insertionParent.left!;
    }
    const rightHead = insertionParent.left;
    attachLeft(pivot, left);
    attachRight(pivot, rightHead);
    recalculate(pivot);
    attachLeft(insertionParent, pivot);
    return rebalanceToRoot(insertionParent);
  }
  attachLeft(pivot, left);
  attachRight(pivot, right);
  recalculate(pivot);
  return pivot;
}

function rebalanceToRoot(start: RopeNode): RopeNode {
  let current: RopeNode | undefined = start;
  let result = start;
  while (current !== undefined) {
    const parent: RopeNode | undefined = current.parent;
    const wasLeftChild = parent !== undefined && parent.left === current;
    const balanced = rebalance(current);
    if (parent === undefined) {
      balanced.parent = undefined;
      result = balanced;
    } else if (wasLeftChild) {
      attachLeft(parent, balanced);
    } else {
      attachRight(parent, balanced);
    }
    current = parent;
  }
  return result;
}

function rebalance(root: RopeNode): RopeNode {
  recalculate(root);
  const balance = heightOf(root.left) - heightOf(root.right);
  if (balance > 1) {
    if (heightOf(root.left!.left) < heightOf(root.left!.right)) {
      attachLeft(root, rotateLeft(root.left!));
    }
    return rotateRight(root);
  }
  if (balance < -1) {
    if (heightOf(root.right!.right) < heightOf(root.right!.left)) {
      attachRight(root, rotateRight(root.right!));
    }
    return rotateLeft(root);
  }
  return root;
}

function rotateLeft(root: RopeNode): RopeNode {
  const replacement = root.right!;
  const transfer = replacement.left;
  const previousParent = root.parent;
  replacement.left = root;
  replacement.parent = previousParent;
  root.parent = replacement;
  root.right = transfer;
  setParent(transfer, root);
  recalculate(root);
  recalculate(replacement);
  return replacement;
}

function rotateRight(root: RopeNode): RopeNode {
  const replacement = root.left!;
  const transfer = replacement.right;
  const previousParent = root.parent;
  replacement.right = root;
  replacement.parent = previousParent;
  root.parent = replacement;
  root.left = transfer;
  setParent(transfer, root);
  recalculate(root);
  recalculate(replacement);
  return replacement;
}

function attachLeft(parent: RopeNode, child: RopeNode | undefined): void {
  parent.left = child;
  setParent(child, parent);
}

function attachRight(parent: RopeNode, child: RopeNode | undefined): void {
  parent.right = child;
  setParent(child, parent);
}

function setParent(
  node: RopeNode | undefined,
  parent: RopeNode | undefined,
): void {
  if (node !== undefined) {
    node.parent = parent;
  }
}

function recalculate(node: RopeNode): void {
  node.height = Math.max(heightOf(node.left), heightOf(node.right)) + 1;
  node.rowCount = countOf(node.left) + countOf(node.right) + 1;
  node.pixelSum = pixelsOf(node.left) + node.rowHeight + pixelsOf(node.right);
}

function heightOf(node: RopeNode | undefined): number {
  return node?.height ?? 0;
}

function countOf(node: RopeNode | undefined): number {
  return node?.rowCount ?? 0;
}

function pixelsOf(node: RopeNode | undefined): number {
  return node?.pixelSum ?? 0;
}

function collectNodes(root: RopeNode | undefined): readonly RopeNode[] {
  const result: RopeNode[] = [];
  const stack: RopeNode[] = [];
  let current = root;
  while (current !== undefined || stack.length > 0) {
    while (current !== undefined) {
      stack.push(current);
      current = current.left;
    }
    current = stack.pop()!;
    result.push(current);
    current = current.right;
  }
  return Object.freeze(result);
}

function successor(node: RopeNode): RopeNode | undefined {
  if (node.right !== undefined) {
    let current = node.right;
    while (current.left !== undefined) {
      current = current.left;
    }
    return current;
  }
  let current = node;
  while (current.parent !== undefined && current === current.parent.right) {
    current = current.parent;
  }
  return current.parent;
}
